const express = require('express');
const logger = require('../utils/logger');
const { handlePipelineError } = require('../utils/errorHandler');
const { expandQuery } = require('../pipeline/queryExpander');
const { retrieveDocuments } = require('../pipeline/documentRetriever');
const { searchAndSummarize } = require('../pipeline/webSearch');
const { handleOversizedContext } = require('../pipeline/knowledgeCompressor');
const { buildFinalPrompt, generateFinalAnswer } = require('../pipeline/finalPromptBuilder');

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
    let processedContext;
    try {
      processedContext = await handleOversizedContext([
        ...uniqueDocs,
        ...(webResults ? [{ 
          text: webResults.summary,
          source: 'web',
          metadata: { urls: webResults.source_urls }
        }] : [])
      ], query);

      logger.info('Context processed:', {
        contextLength: processedContext?.compressed_text?.length || 0,
        keyPoints: processedContext?.key_points?.length || 0,
        sources: processedContext?.source_ids?.length || 0
      });
    } catch (error) {
      logger.warn('Error processing context:', {
        error: error.message,
        uniqueDocs: uniqueDocs.length,
        hasWebResults: !!webResults
      });
      
      // Provide a valid structure even on error
      processedContext = {
        compressed_text: 'Failed to process context.',
        key_points: [],
        source_ids: [],
        source_snippets: [],
        error: error.message
      };
    }

    // Determine if this is a naval/military query
    const isNavalQuery = query.toLowerCase().includes('naval') ||
                        query.toLowerCase().includes('ship') ||
                        query.toLowerCase().includes('military') ||
                        query.toLowerCase().includes('war');

    // Look for temporal indicators
    const hasTimeContext = query.toLowerCase().includes('during') ||
                          query.toLowerCase().includes('after') ||
                          query.toLowerCase().includes('before') ||
                          query.toLowerCase().includes('when');

    // Check if query is about events outside the book
    const isExternalQuery = query.toLowerCase().includes('not related to') ||
                          query.toLowerCase().includes('other than') ||
                          query.toLowerCase().includes('outside of');

    logger.info('Query analysis:', {
      query,
      is_naval_query: isNavalQuery,
      has_time_context: hasTimeContext,
      is_external_query: isExternalQuery
    });

    // Step 5: Build final prompt and generate answer
    const queryInfo = {
      original_query: query,
      project_id: projectId,
      query_type: isNavalQuery ? 'Naval/Military History' : 'General',
      focus: isExternalQuery ? 'Information outside book context' : 'Book-related information'
    };

    // Build the final prompt using the proper function
    const { prompt: finalPrompt } = await buildFinalPrompt(
      queryInfo,
      processedContext,
      webResults,
      null // No evaluation info for now
    );

    // Generate final answer with error handling
    let answer;
    try {
      answer = await generateFinalAnswer(finalPrompt);
      logger.info('Answer generated:', { 
        length: answer?.length || 0,
        has_citations: answer?.includes('[') || false,
        has_sources: answer?.includes('Sources:') || false
      });
    } catch (error) {
      logger.error('Error generating final answer:', {
        error: error.message,
        prompt_length: finalPrompt.length,
        has_context: processedContext.source_snippets.length > 0,
        has_web: !!webResults
      });

      // Provide a fallback answer
      answer = `I apologize, but I encountered an error while generating the answer. 

Here's what I know:
${webResults ? `- Found ${webResults.source_urls.length} relevant web sources about this topic` : '- No web sources found'}
${processedContext.source_snippets.length > 0 ? `- Found ${processedContext.source_snippets.length} relevant passages in the book` : '- No relevant book passages found'}

The error was: ${error.message}

Please try rephrasing your question or being more specific about what you'd like to know.`;
    }

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
    // Only include variables that are defined
    const errorContext = {
      query: req.body?.query,
      projectId: req.body?.projectId
    };

    // Add optional context if available
    if (typeof expandedQueries !== 'undefined') errorContext.expandedQueries = expandedQueries;
    if (typeof uniqueDocs !== 'undefined') errorContext.uniqueDocs = uniqueDocs;
    if (typeof webResults !== 'undefined') errorContext.webResults = webResults;
    if (typeof processedContext !== 'undefined') errorContext.processedContext = processedContext;

    const errorResponse = handlePipelineError(error, errorContext);
    return res.status(500).json(errorResponse);
  }
});

module.exports = router;