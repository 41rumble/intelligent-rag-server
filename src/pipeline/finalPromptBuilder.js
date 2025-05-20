const logger = require('../utils/logger');
const { generateCompletion } = require('../utils/llmProvider');
require('dotenv').config();

/**
 * Build a final prompt for the LLM
 * @param {Object} queryInfo - Classified query information
 * @param {Object} compressedKnowledge - Compressed knowledge
 * @param {Object} webSummary - Web search summary (optional)
 * @param {Object} evaluationInfo - Evaluation information (optional)
 * @returns {Promise<Object>} Final prompt and context
 */
async function buildFinalPrompt(queryInfo, compressedKnowledge, webSummary = null, evaluationInfo = null) {
  try {
    // Validate required inputs
    if (!queryInfo || !compressedKnowledge || !compressedKnowledge.compressed_text) {
      throw new Error('Missing required context for prompt building');
    }

    // Base context with more structured information
    let context = `
    QUERY INFORMATION:
    - Original Query: "${queryInfo.original_query}"
    - Project ID: "${queryInfo.project_id}"
    - Query Type: ${queryInfo.query_type || 'General'}
    - Query Focus: ${queryInfo.focus || 'Not specified'}
    
    CORE KNOWLEDGE BASE:
    ${compressedKnowledge.compressed_text}
    
    ESSENTIAL POINTS:
    ${compressedKnowledge.key_points.map((point, i) => `${i + 1}. ${point}`).join('\n')}
    `;
    
    // Add web search information if available
    if (webSummary && webSummary.summary) {
      context += `
      
      ADDITIONAL INFORMATION FROM WEB SEARCH:
      ${webSummary.summary}
      
      ADDITIONAL FACTS:
      ${webSummary.facts.map(fact => `- ${fact}`).join('\n')}
      `;
    }
    
    // Add evaluation information if available
    if (evaluationInfo) {
      context += `
      
      AREAS NEEDING IMPROVEMENT:
      ${evaluationInfo.focus_areas ? evaluationInfo.focus_areas.map(area => `- ${area}`).join('\n') : 'None specified'}
      
      ALTERNATIVE PERSPECTIVES TO CONSIDER:
      ${evaluationInfo.alternative_perspectives ? evaluationInfo.alternative_perspectives.map(perspective => `- ${perspective}`).join('\n') : 'None specified'}
      `;
    }
    
    // Build the final prompt
    const finalPrompt = `
    You are an intelligent assistant specializing in literature and historical analysis. Answer the following query based on the provided context. Your response should be:
    
    1. Comprehensive and directly address the query
    2. Well-structured with clear organization
    3. Factually accurate and based on the provided information
    4. Written in a natural, engaging style
    5. Include citations to sources when appropriate
    
    ${context}
    
    Provide a thoughtful, well-reasoned response to the query.
    `;
    
    logger.info('Final prompt built:', { 
      query: queryInfo.original_query,
      prompt_length: finalPrompt.length
    });
    
    return {
      prompt: finalPrompt,
      context: context
    };
  } catch (error) {
    logger.error('Error building final prompt:', error);
    
    // Fallback prompt
    const fallbackPrompt = `
    Answer the following query based on your knowledge:
    
    QUERY: "${queryInfo.original_query}"
    
    Provide a thoughtful, well-reasoned response.
    `;
    
    return {
      prompt: fallbackPrompt,
      context: 'Error building context'
    };
  }
}

/**
 * Generate the final answer using the LLM
 * @param {string} finalPrompt - Final prompt for the LLM
 * @returns {Promise<string>} Generated answer
 */
async function generateFinalAnswer(finalPrompt) {
  try {
    // Validate and clean the prompt
    if (!finalPrompt || typeof finalPrompt !== 'string') {
      throw new Error('Invalid prompt format');
    }

    // Generate the answer with more focused parameters
    const answer = await generateCompletion(finalPrompt, {
      temperature: 0.5, // Lower temperature for more focused answers
      maxTokens: 1500,  // Slightly shorter but more concise answers
      presencePenalty: 0.5, // Encourage diversity in response
      frequencyPenalty: 0.3 // Reduce repetition
    });
    
    // Validate the answer
    if (!answer || answer.trim().length === 0) {
      throw new Error('Empty or invalid answer generated');
    }
    
    logger.info('Final answer generated:', { 
      answer_length: answer.length,
      prompt_length: finalPrompt.length
    });
    
    return answer.trim();
  } catch (error) {
    logger.error('Error generating final answer:', {
      error: error.message,
      prompt_length: finalPrompt?.length
    });
    throw error; // Let the router handle the error
  }
}

module.exports = {
  buildFinalPrompt,
  generateFinalAnswer
};