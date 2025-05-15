const { OpenAI } = require('openai');
const logger = require('../utils/logger');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Classify a query to extract entities and query type
 * @param {string} query - User query
 * @param {string} projectId - Project identifier
 * @returns {Promise<Object>} Classification result
 */
async function classifyQuery(query, projectId) {
  try {
    const prompt = `
    Analyze the following query about a book/project and extract key information:
    
    Query: "${query}"
    Project: "${projectId}"
    
    Identify and extract:
    1. People/characters mentioned
    2. Locations mentioned
    3. Time periods mentioned
    4. Key topics or themes
    5. Query type (factual, analytical, comparative, etc.)
    
    Format your response as a JSON object with these fields:
    - people: Array of people/characters mentioned
    - locations: Array of locations mentioned
    - time_periods: Array of time periods mentioned
    - topics: Array of key topics or themes
    - query_type: Type of query
    - query_complexity: Numerical rating from 1-10 of how complex this query is
    `;

    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const classification = JSON.parse(response.choices[0].message.content);
    
    logger.info('Query classified:', { 
      query, 
      query_type: classification.query_type,
      complexity: classification.query_complexity
    });
    
    return {
      ...classification,
      original_query: query,
      project_id: projectId
    };
  } catch (error) {
    logger.error('Error classifying query:', error);
    
    // Return basic classification on error
    return {
      people: [],
      locations: [],
      time_periods: [],
      topics: [],
      query_type: 'unknown',
      query_complexity: 5,
      original_query: query,
      project_id: projectId
    };
  }
}

module.exports = {
  classifyQuery
};