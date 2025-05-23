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
    Generate ${branchCount} web-search optimized queries based on this original query:
    
    Original query: "${query}"
    
    For each alternative query:
    1. Create search-engine optimized versions that will find relevant web pages
    2. Add contextual terms that would help find specific information
    3. Include variations that target:
       - Historical/factual information
       - Technical/specific details
       - Overview/summary information
    4. If the query is about a specific thing (ship, person, event, etc.), include:
       - Full name/designation queries
       - Time period specific queries
       - Location specific queries
    
    Example:
    Original: "What happened to the HMS Victory?"
    Expanded:
    - "HMS Victory ship history fate current location"
    - "HMS Victory Nelson's flagship Portsmouth details"
    - "When was HMS Victory retired preservation status"
    
    Format your response as a JSON object with:
    - expanded_queries: Array of alternative query strings
    - search_focus: What specific aspects each query targets
    - context_terms: Key contextual terms added to improve results
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