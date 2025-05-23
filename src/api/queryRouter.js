const express = require('express');
const logger = require('../utils/logger');
const { handlePipelineError } = require('../utils/errorHandler');
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
    2. Use [source_id] citations after EVERY fact or quote
    3. Format citations as [id1][id2] if multiple sources support a fact
    4. If information is missing or unclear, acknowledge this
    5. Structure the answer with clear paragraphs
    6. End with a "Sources:" section listing all cited sources

    Example format:
    "Asa Jennings arrived in Smyrna in August 1922 [bio_12]. During the Great Fire, he worked with both Greek and Turkish authorities [doc_45][web_2] to coordinate evacuation efforts..."

    Sources:
    [bio_12] Character biography
    [doc_45] Chapter 3 excerpt
    [web_2] Historical article
    `;

    const answer = await generateFinalAnswer(finalPrompt);
    logger.info('Answer generated:', { length: answer.length });

    // Initialize empty arrays for snippets
    let formattedSnippets = [];
    let webSources = [];

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

    // Format source snippets
    formattedSnippets = processedContext.source_snippets.map(snippet => ({
      id: snippet.id,
      text: snippet.text,
      source: snippet.source,
      relevance: snippet.relevance || 1.0,
      metadata: {
        type: snippet.type || 'text',
        chapter: snippet.chapter || null,
        page: snippet.page || null
      }
    }));

    // Format web sources
    webSources = webResults ? webResults.source_urls.map((url, index) => ({
      id: `web_${index + 1}`,
      text: url.url || url,
      source: 'web',
      relevance: 1.0,
      metadata: {
        type: 'web',
        url: url.url || url,
        title: url.title || null
      }
    })) : [];

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

    // Return response
    return res.json({
      answer: answer.trim(),
      source_snippets: [...formattedSnippets, ...webSources],
      log: responseLog
    });
  } catch (error) {
    const errorResponse = handlePipelineError(error, {
      query,
      projectId,
      expandedQueries,
      uniqueDocs,
      webResults,
      processedContext
    });
    return res.status(500).json(errorResponse);
  }
});

module.exports = router;