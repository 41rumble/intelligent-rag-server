const { OpenAI } = require('openai');
const logger = require('../utils/logger');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate semantically similar queries to improve retrieval
 * @param {Object} queryInfo - Classified query information
 * @param {number} branchCount - Number of branch queries to generate
 * @returns {Promise<Array>} Array of expanded queries
 */
async function expandQuery(queryInfo, branchCount = 3) {
  try {
    const { original_query, people, locations, time_periods, topics, query_type } = queryInfo;
    
    const prompt = `
    Generate ${branchCount} semantically similar but distinct queries based on this original query:
    
    Original query: "${original_query}"
    
    Context information:
    - People mentioned: ${people.join(', ') || 'None'}
    - Locations: ${locations.join(', ') || 'None'}
    - Time periods: ${time_periods.join(', ') || 'None'}
    - Topics: ${topics.join(', ') || 'None'}
    - Query type: ${query_type}
    
    For each alternative query:
    1. Rephrase the question to focus on a different aspect of the same topic
    2. Make sure each query would help retrieve relevant information
    3. Ensure the queries are diverse but related to the original intent
    
    Format your response as a JSON object with:
    - expanded_queries: Array of alternative query strings
    - reasoning: Brief explanation of how these queries expand the search space
    `;

    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    logger.info('Query expanded:', { 
      original: original_query,
      expanded_count: result.expanded_queries.length
    });
    
    return {
      original_query: original_query,
      expanded_queries: result.expanded_queries,
      reasoning: result.reasoning
    };
  } catch (error) {
    logger.error('Error expanding query:', error);
    
    // Return original query on error
    return {
      original_query: queryInfo.original_query,
      expanded_queries: [],
      reasoning: 'Failed to generate expanded queries due to an error.'
    };
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

    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200
    });

    const rephrased = response.choices[0].message.content.trim();
    
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