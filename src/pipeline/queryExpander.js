const logger = require('../utils/logger');
const { generateStructuredResponse, generateCompletion } = require('../utils/llmProvider');
require('dotenv').config();

/**
 * Generate semantically similar queries to improve retrieval
 * @param {string} query - Original query string
 * @param {number} branchCount - Number of branch queries to generate
 * @returns {Promise<Array>} Array of expanded queries
 */
async function expandQuery(query, branchCount = 3) {
  try {
    const prompt = `
    Generate ${branchCount} semantically similar but distinct queries based on this original query:
    
    Original query: "${query}"
    
    For each alternative query:
    1. Rephrase the question to focus on a different aspect of the same topic
    2. Make sure each query would help retrieve relevant information
    3. Ensure the queries are diverse but related to the original intent
    
    Format your response as a JSON object with:
    - expanded_queries: Array of alternative query strings
    - reasoning: Brief explanation of how these queries expand the search space
    `;

    const result = await generateStructuredResponse(prompt, {
      temperature: 0.7,
      maxTokens: 800
    });
    
    logger.info('Query expanded:', { 
      original: query,
      expanded_count: result.expanded_queries.length
    });
    
    return result.expanded_queries;
  } catch (error) {
    logger.error('Error expanding query:', error);
    
    // Return empty array on error
    return [];
  }
}

/**
 * Rephrase a query to improve relevance
 * @param {string} query - Original query
 * @returns {Promise<string>} Rephrased query
 */
async function rephraseQuery(query) {
  try {
    const prompt = `
    Rephrase the following query to make it more precise and searchable:
    
    Original query: "${query}"
    
    Your task is to:
    1. Clarify any ambiguities
    2. Add specificity where helpful
    3. Maintain the original intent
    4. Format it as a clear, searchable question
    
    Provide only the rephrased query without explanation.
    `;

    const rephrased = await generateCompletion(prompt, {
      temperature: 0.3,
      maxTokens: 200
    });
    
    logger.info('Query rephrased:', { 
      original: query,
      rephrased: rephrased
    });
    
    return rephrased;
  } catch (error) {
    logger.error('Error rephrasing query:', error);
    return query; // Return original query on error
  }
}

module.exports = {
  expandQuery,
  rephraseQuery
};