const express = require('express');
const logger = require('../utils/logger');
const { expandQuery } = require('../pipeline/queryExpander');
const { retrieveDocuments } = require('../pipeline/documentRetriever');
const { searchAndSummarize } = require('../pipeline/webSearch');
const { handleOversizedContext } = require('../pipeline/knowledgeCompressor');
const { generateFinalAnswer } = require('../pipeline/finalPromptBuilder');

const router = express.Router();

/**
 * Process a query through the RAG pipeline:
 * 1. Expand query to find more relevant content
 * 2. Search documents with all queries
 * 3. Get relevant web content
 * 4. Process all context
 * 5. Generate final answer
 */
router.post('/', async (req, res) => {
  try {
    const { projectId, query } = req.body;
    
    if (!projectId || !query) {
      return res.status(400).json({
        error: 'Missing required parameters: projectId and query are required'
      });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    logger.info('Starting query processing:', { projectId, query });

    // Step 1: Generate similar queries to expand search coverage
    const expandedQueries = await expandQuery(query, 3);
    logger.info('Generated similar queries:', { 
      original: query,
      expanded: expandedQueries,
      total: expandedQueries.length + 1 
    });

    // Step 2: Search documents with all queries
    const allQueries = [query, ...expandedQueries];
    const allDocuments = [];
    
    for (const q of allQueries) {
      const docs = await retrieveDocuments(q, { projectId }, 3);
      allDocuments.push(...docs);
    }

    // Deduplicate and sort by relevance
    const uniqueDocs = Array.from(
      new Map(allDocuments.map(doc => [doc._id, doc])).values()
    ).sort((a, b) => b.relevance - a.relevance)
     .slice(0, 5);

    logger.info('Retrieved relevant documents:', {
      total: allDocuments.length,
      unique: uniqueDocs.length,
      sources: uniqueDocs.map(d => d.source)
    });

    // Step 3: Get relevant web content
    const webQuery = `${query} book:"${projectId}"`;
    const webResults = await searchAndSummarize(webQuery);
    logger.info('Web search completed', {
      hasResults: !!webResults,
      summaryLength: webResults?.summary?.length || 0
    });

    // Step 4: Process all context
    const processedContext = await handleOversizedContext([
      ...uniqueDocs,
      ...(webResults ? [{
        text: webResults.summary,
        source: 'web',
        metadata: { urls: webResults.source_urls }
      }] : [])
    ], query);

    logger.info('Context processed:', {
      contextLength: processedContext.compressed_text.length,
      keyPoints: processedContext.key_points.length,
      sources: processedContext.source_ids.length
    });

    // Step 5: Generate final answer with citations
    const finalPrompt = `
    QUERY: "${query}"
    PROJECT: "${projectId}"

    CONTEXT FROM DOCUMENTS:
    ${processedContext.source_snippets.map(snippet => 
      `[${snippet.id}] From ${snippet.source}:
      "${snippet.text}"`
    ).join('\n\n')}

    KEY POINTS:
    ${processedContext.key_points.map((p, i) => `[KP${i+1}] ${p}`).join('\n')}

    ${webResults ? `
    ADDITIONAL CONTEXT FROM WEB:
    ${webResults.summary}
    
    WEB SOURCES:
    ${webResults.source_urls.map((url, i) => 
      `[WEB${i+1}] ${url.title || ''}\n${url.url || url}`
    ).join('\n\n')}
    ` : ''}

    INSTRUCTIONS:
    1. Based ONLY on the above context, provide a clear and concise answer
    2. Present information without source citations
    3. If information is missing or unclear, acknowledge this
    4. Structure the answer with clear paragraphs

    Example format:
    "Asa Jennings arrived in Smyrna in August 1922. During the Great Fire, he worked with both Greek and Turkish authorities to coordinate evacuation efforts."
    `;

    // Format source snippets
    let formattedSnippets = processedContext.source_snippets.map(snippet => {
      // Generate a meaningful ID based on the source type and content
      let sourceId;
      if (snippet.type === 'chapter_synopsis') {
        sourceId = `ch_${snippet.chapter || 'unknown'}`;
      } else if (snippet.type === 'bio') {
        sourceId = `bio_${(snippet.name || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      } else if (snippet.type === 'plot_event') {
        sourceId = `event_${snippet.id || 'unknown'}`;
      } else if (snippet.type === 'location_description') {
        sourceId = `loc_${(snippet.location || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      } else {
        sourceId = `doc_${snippet.id || 'unknown'}`;
      }

      return {
        id: sourceId,
        text: snippet.text,
        source: snippet.source,
        relevance: snippet.relevance || 1.0,
        metadata: {
          type: snippet.type || 'text',
          chapter: snippet.chapter || null,
          page: snippet.page || null,
          name: snippet.name || null,
          location: snippet.location || null
        }
      };
    });

    // Format web sources
    let webSources = webResults ? webResults.source_urls.map((url, index) => {
      const urlObj = typeof url === 'string' ? { url } : url;
      const domain = new URL(urlObj.url).hostname.replace('www.', '');
      return {
        id: `web_${domain.replace(/[^a-z0-9]/g, '_')}`,
        text: urlObj.url,
        source: 'web',
        relevance: 1.0,
        metadata: {
          type: 'web',
          url: urlObj.url,
          title: urlObj.title || null,
          domain: domain
        }
      };
    }) : [];

    // Generate answer with streaming
    let answer = '';
    let answerBuffer = '';
    
    // Send initial message with source snippets
    res.write(Buffer.from(JSON.stringify({
      type: 'response',
      data: {
        text: '',
        complete: false,
        source_snippets: [...formattedSnippets, ...webSources],
        progress: {
          current_step: 'answer_generation',
          total_steps: 5,
          completed_steps: 4,
          steps: [
            {
              id: 'query_expansion',
              status: 'completed',
              message: 'Query analysis complete',
              details: `Found ${expandedQueries.length} similar queries`
            },
            {
              id: 'document_search',
              status: 'completed',
              message: 'Book content search complete',
              details: `Found ${uniqueDocs.length} relevant passages`
            },
            {
              id: 'web_search',
              status: 'completed',
              message: 'Web search complete',
              details: webResults ? `Found ${webResults.source_urls.length} relevant web sources` : 'No web sources needed'
            },
            {
              id: 'context_processing',
              status: 'completed',
              message: 'Content processing complete',
              details: `Processed ${processedContext.key_points.length} key points`
            },
            {
              id: 'answer_generation',
              status: 'in_progress',
              message: 'Generating final answer',
              details: 'Crafting response...'
            }
          ]
        }
      }
    }) + '\n', 'utf8'));

    // Generate answer with streaming
    answer = await generateFinalAnswer(finalPrompt, (chunk) => {
      // Append chunk to buffer
      answerBuffer += chunk;
      
      // Send answer progress
      res.write(Buffer.from(JSON.stringify({
        type: 'response',
        data: {
          text: chunk,
          complete: false
        }
      }) + '\n', 'utf8'));
    });

    logger.info('Answer generated:', { length: answer.length });

    // Format response for logging
    const responseLog = {
      query,
      projectId,
      timestamp: new Date().toISOString(),
      steps: [
        {
          step: 'retrieve_documents',
          result: {
            total_documents: allDocuments.length,
            unique_documents: uniqueDocs.length,
            document_ids: uniqueDocs.map(doc => doc._id)
          }
        },
        {
          step: 'web_search',
          result: {
            has_results: !!webResults,
            summary_length: webResults?.summary?.length || 0,
            source_urls: webResults?.source_urls || []
          }
        },
        {
          step: 'compress_knowledge',
          result: {
            compressed_length: processedContext.compressed_text.length,
            key_points_count: processedContext.key_points.length,
            source_ids: processedContext.source_ids
          }
        },
        {
          step: 'generate_answer',
          result: {
            prompt_length: finalPrompt.length,
            answer_length: answer.length,
            context_sources: processedContext.source_ids,
            has_web_data: !!webResults
          }
        }
      ]
    };

    // Log the formatted response
    logger.info('\n=== Query Response ===\n' +
      `Query: "${query}"\n\n` +
      `Answer: ${answer}\n\n` +
      '=== Source Snippets ===\n' +
      [...formattedSnippets, ...webSources]
        .map(snippet =>
          `[${snippet.id}]\n` +
          `Text: ${snippet.text}\n` +
          `Relevance: ${snippet.relevance}\n`
        ).join('\n') +
      '\n=== Pipeline Steps ===\n' +
      responseLog.steps
        .map(step =>
          `${step.step}:\n${JSON.stringify(step.result, null, 2)}\n`
        ).join('\n')
    );

    // Send final completion
    res.write(Buffer.from(JSON.stringify({
      type: 'response',
      data: {
        text: '',
        complete: true,
        answer: answer.trim(),
        log: responseLog,
        progress: {
          current_step: 'completed',
          total_steps: 5,
          completed_steps: 5,
          steps: [
            {
              id: 'query_expansion',
              status: 'completed',
              message: 'Query analysis complete',
              details: `Found ${expandedQueries.length} similar queries`
            },
            {
              id: 'document_search',
              status: 'completed',
              message: 'Book content search complete',
              details: `Found ${uniqueDocs.length} relevant passages`
            },
            {
              id: 'web_search',
              status: 'completed',
              message: 'Web search complete',
              details: webResults ? `Found ${webResults.source_urls.length} relevant web sources` : 'No web sources needed'
            },
            {
              id: 'context_processing',
              status: 'completed',
              message: 'Content processing complete',
              details: `Processed ${processedContext.key_points.length} key points`
            },
            {
              id: 'answer_generation',
              status: 'completed',
              message: 'Generating final answer',
              details: `Generated ${answer.length} character response`
            }
          ]
        }
      }
    }) + '\n', 'utf8'));

    // End the response stream
    res.end();
  } catch (error) {
    logger.error('Error processing query:', error);
    return res.status(500).json({
      error: 'Failed to process query',
      message: error.message
    });
  }
});

module.exports = router;