const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
require('dotenv').config();

/**
 * Evaluate the quality and relevance of a response
 * @param {string} response - Generated response
 * @param {string} query - Original query
 * @returns {Promise<Object>} Evaluation results
 */
async function evaluateResponse(response, query) {
  try {
    const prompt = `
    Evaluate the quality and relevance of this response to the query:
    
    Query: "${query}"
    
    Response:
    ${response}
    
    Evaluate on these dimensions:
    1. Relevance: How directly does it address the query? (1-10)
    2. Completeness: How thoroughly does it cover the topic? (1-10)
    3. Accuracy: How factually correct does the information appear? (1-10)
    4. Coherence: How well-structured and logical is the response? (1-10)
    
    Also identify:
    - Any gaps or missing information
    - Any potential inaccuracies
    - Suggestions for improvement
    
    Format your response as a JSON object with:
    - relevance_score: number (1-10)
    - completeness_score: number (1-10)
    - accuracy_score: number (1-10)
    - coherence_score: number (1-10)
    - overall_score: number (1-10)
    - gaps: array of strings
    - potential_inaccuracies: array of strings
    - improvement_suggestions: array of strings
    `;

    const evaluation = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 1000
    });
    
    logger.info('Response evaluated:', { 
      query,
      overall_score: evaluation.overall_score,
      gaps_count: evaluation.gaps.length
    });
    
    return evaluation;
  } catch (error) {
    logger.error('Error evaluating response:', error);
    return {
      relevance_score: 5,
      completeness_score: 5,
      accuracy_score: 5,
      coherence_score: 5,
      overall_score: 5,
      gaps: ['Evaluation failed due to an error'],
      potential_inaccuracies: [],
      improvement_suggestions: ['Retry evaluation']
    };
  }
}

/**
 * Determine if a response needs improvement
 * @param {Object} evaluation - Evaluation results
 * @returns {boolean} True if improvement needed
 */
function needsImprovement(evaluation) {
  // Consider improvement needed if overall score is below 7
  // or any individual score is below 6
  return (
    evaluation.overall_score < 7 ||
    evaluation.relevance_score < 6 ||
    evaluation.completeness_score < 6 ||
    evaluation.accuracy_score < 6 ||
    evaluation.coherence_score < 6 ||
    evaluation.gaps.length > 2
  );
}

/**
 * Generate improvement suggestions based on evaluation
 * @param {Object} evaluation - Evaluation results
 * @param {string} query - Original query
 * @returns {Promise<Object>} Improvement suggestions
 */
async function generateImprovementSuggestions(evaluation, query) {
  try {
    const prompt = `
    Based on this evaluation of a response to the query: "${query}"
    
    Evaluation:
    ${JSON.stringify(evaluation, null, 2)}
    
    Generate specific suggestions to improve the response:
    1. Additional questions that should be researched
    2. Specific areas that need more detail
    3. Alternative perspectives to consider
    
    Format your response as a JSON object with:
    - additional_queries: Array of specific questions to research
    - focus_areas: Array of areas needing more detail
    - alternative_perspectives: Array of different viewpoints to consider
    `;

    const suggestions = await generateStructuredResponse(prompt, {
      temperature: 0.5,
      maxTokens: 800
    });
    
    logger.info('Improvement suggestions generated:', { 
      query,
      additional_queries_count: suggestions.additional_queries.length
    });
    
    return suggestions;
  } catch (error) {
    logger.error('Error generating improvement suggestions:', error);
    return {
      additional_queries: [],
      focus_areas: [],
      alternative_perspectives: []
    };
  }
}

module.exports = {
  evaluateResponse,
  needsImprovement,
  generateImprovementSuggestions
};