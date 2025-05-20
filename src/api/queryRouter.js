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

    // Step 5: Generate final answer
    const finalPrompt = `
    QUERY: "${query}"
    PROJECT: "${projectId}"

    CONTEXT FROM DOCUMENTS:
    ${processedContext.compressed_text}

    KEY POINTS:
    ${processedContext.key_points.map(p => `- ${p}`).join('\n')}

    ${webResults ? `
    ADDITIONAL CONTEXT FROM WEB:
    ${webResults.summary}
    ` : ''}

    Based ONLY on the above context, provide a clear and concise answer to the query.
    If the context doesn't contain enough information to fully answer the query, acknowledge what's missing.
    Include references to sources when possible.
    `;

    const answer = await generateFinalAnswer(finalPrompt);
    logger.info('Answer generated:', { length: answer.length });

    // Send response
    return res.json({
      answer: answer.trim(),
      source_snippets: processedContext.source_snippets || [],
      metadata: {
        sources_used: processedContext.source_ids || [],
        has_web_data: !!webResults
      }
    });
  } catch (error) {
    logger.error('Error processing query:', error);
    return res.status(500).json({
      error: 'Failed to process query',
      message: error.message
    });
  }
});

module.exports = router;