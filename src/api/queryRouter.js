const express = require('express');
const logger = require('../utils/logger');
const { classifyQuery } = require('../pipeline/queryClassifier');
const { expandQuery, rephraseQuery } = require('../pipeline/queryExpander');
const { retrieveDocuments } = require('../pipeline/documentRetriever');
const { searchAndSummarize } = require('../pipeline/webSearch');
const { handleOversizedContext } = require('../pipeline/knowledgeCompressor');
const { evaluateResponse, needsImprovement, generateImprovementSuggestions } = require('../pipeline/evaluator');
const { buildFinalPrompt, generateFinalAnswer } = require('../pipeline/finalPromptBuilder');

const router = express.Router();

/**
 * Process a query with configurable thinking depth
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
router.post('/', async (req, res) => {
  try {
    const { projectId, query, thinkingDepth = 5 } = req.body;
    
    if (!projectId || !query) {
      return res.status(400).json({
        error: 'Missing required parameters: projectId and query are required'
      });
    }
    
    logger.info('Query received:', { projectId, query, thinkingDepth });
    
    // Initialize response log
    const responseLog = {
      query,
      projectId,
      thinkingDepth,
      timestamp: new Date().toISOString(),
      steps: []
    };
    
    // Step 1: Classify query (always performed)
    const queryInfo = await classifyQuery(query, projectId);
    responseLog.steps.push({
      step: 'classify_query',
      result: queryInfo
    });
    
    // Initialize variables for pipeline
    let processedQuery = query;
    let expandedQueries = [];
    let retrievedDocuments = [];
    let webSummary = null;
    let compressedKnowledge = null;
    let evaluation = null;
    let improvementSuggestions = null;
    let finalPrompt = null;
    let answer = null;
    
    // Step 2: Rephrase query (if thinkingDepth >= 2)
    if (thinkingDepth >= 2) {
      processedQuery = await rephraseQuery(query);
      responseLog.steps.push({
        step: 'rephrase_query',
        result: { original: query, rephrased: processedQuery }
      });
    }
    
    // Step 3: Expand query (if thinkingDepth >= 4)
    if (thinkingDepth >= 4) {
      const expansion = await expandQuery(queryInfo, 3);
      expandedQueries = expansion.expanded_queries;
      responseLog.steps.push({
        step: 'expand_query',
        result: expansion
      });
    }
    
    // Step 4: Retrieve documents for original and expanded queries
    const allQueries = [processedQuery, ...expandedQueries];
    const retrievalPromises = allQueries.map(q => 
      retrieveDocuments(q, queryInfo, 5)
    );
    
    const retrievalResults = await Promise.all(retrievalPromises);
    
    // Combine all retrieved documents
    const documentMap = new Map();
    retrievalResults.forEach(docs => {
      docs.forEach(doc => {
        documentMap.set(doc._id, doc);
      });
    });
    
    retrievedDocuments = Array.from(documentMap.values());
    responseLog.steps.push({
      step: 'retrieve_documents',
      result: {
        query_count: allQueries.length,
        document_count: retrievedDocuments.length,
        document_ids: retrievedDocuments.map(doc => doc._id)
      }
    });
    
    // Step 5: Web search (if thinkingDepth >= 7)
    if (thinkingDepth >= 7) {
      webSummary = await searchAndSummarize(processedQuery);
      responseLog.steps.push({
        step: 'web_search',
        result: {
          summary_length: webSummary.summary.length,
          facts_count: webSummary.facts.length,
          source_urls: webSummary.source_urls
        }
      });
    }
    
    // Step 6: Compress knowledge
    compressedKnowledge = await handleOversizedContext(retrievedDocuments, processedQuery);
    responseLog.steps.push({
      step: 'compress_knowledge',
      result: {
        compressed_length: compressedKnowledge.compressed_text.length,
        key_points_count: compressedKnowledge.key_points.length,
        source_ids: compressedKnowledge.source_ids
      }
    });
    
    // Step 7: Build final prompt and generate initial answer
    finalPrompt = await buildFinalPrompt(queryInfo, compressedKnowledge, webSummary);

    // Add source constraints to the prompt
    finalPrompt.prompt = `You are answering questions about the project "${projectId}". 
IMPORTANT: Base your answer ONLY on the provided context. If the context doesn't contain enough information to fully answer the question, acknowledge the limitations and stick to what's available in the provided documents.
DO NOT include information from your general knowledge unless it's specifically present in the provided context.

${finalPrompt.prompt}`;

    answer = await generateFinalAnswer(finalPrompt.prompt);
    responseLog.steps.push({
      step: 'generate_initial_answer',
      result: {
        prompt_length: finalPrompt.prompt.length,
        answer_length: answer.length,
        context_sources: compressedKnowledge.source_ids,
        has_web_data: !!webSummary
      }
    });
    
    // Step 8: Evaluate answer (if thinkingDepth >= 9)
    if (thinkingDepth >= 9) {
      evaluation = await evaluateResponse(answer, processedQuery);
      responseLog.steps.push({
        step: 'evaluate_answer',
        result: evaluation
      });
      
      // Step 9: Improve answer if needed
      if (needsImprovement(evaluation)) {
        improvementSuggestions = await generateImprovementSuggestions(evaluation, processedQuery);
        responseLog.steps.push({
          step: 'generate_improvement_suggestions',
          result: improvementSuggestions
        });
        
        // Rebuild prompt with improvement suggestions
        finalPrompt = await buildFinalPrompt(
          queryInfo, 
          compressedKnowledge, 
          webSummary, 
          improvementSuggestions
        );
        
        // Generate improved answer
        answer = await generateFinalAnswer(finalPrompt.prompt);
        responseLog.steps.push({
          step: 'generate_improved_answer',
          result: {
            prompt_length: finalPrompt.prompt.length,
            answer_length: answer.length
          }
        });
      }
    }
    
    // Return final response
    res.json({
      answer,
      log: responseLog
    });
  } catch (error) {
    logger.error('Error processing query:', error);
    
    res.status(500).json({
      error: 'An error occurred while processing your query',
      message: error.message
    });
  }
});

module.exports = router;