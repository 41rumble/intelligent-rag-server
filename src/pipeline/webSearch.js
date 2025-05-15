const axios = require('axios');
const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
require('dotenv').config();

// SearXNG instance URL
const searxngInstance = process.env.SEARXNG_INSTANCE;

/**
 * Perform a web search using SearXNG
 * @param {string} query - Search query
 * @param {number} numResults - Number of results to return
 * @returns {Promise<Array>} Search results
 */
async function performWebSearch(query, numResults = 5) {
  try {
    if (!searxngInstance) {
      logger.warn('SearXNG instance URL not configured');
      return [];
    }
    
    const response = await axios.get(`${searxngInstance}/search`, {
      params: {
        q: query,
        format: 'json',
        categories: 'general',
        language: 'en-US',
        time_range: '',
        engines: 'google,bing,duckduckgo',
        max_results: numResults
      }
    });
    
    const results = response.data.results || [];
    
    logger.info('Web search completed:', { 
      query, 
      results_count: results.length
    });
    
    return results.map(result => ({
      title: result.title,
      url: result.url,
      content: result.content,
      source: 'web_search'
    }));
  } catch (error) {
    logger.error('Error performing web search:', error);
    return [];
  }
}

/**
 * Summarize web search results
 * @param {Array} searchResults - Web search results
 * @param {string} originalQuery - Original query
 * @returns {Promise<Object>} Summarized information
 */
async function summarizeWebResults(searchResults, originalQuery) {
  try {
    if (searchResults.length === 0) {
      return {
        summary: 'No web search results available.',
        facts: [],
        source_urls: []
      };
    }
    
    // Format search results for the prompt
    const formattedResults = searchResults.map((result, index) => 
      `[${index + 1}] ${result.title}\nURL: ${result.url}\n${result.content}`
    ).join('\n\n');
    
    const prompt = `
    Summarize the following web search results for the query: "${originalQuery}"
    
    SEARCH RESULTS:
    ${formattedResults}
    
    Create a concise summary that:
    1. Extracts key facts relevant to the query
    2. Resolves any contradictions between sources
    3. Provides accurate, factual information
    4. Cites which source number ([1], [2], etc.) each piece of information comes from
    
    Format your response as a JSON object with:
    - summary: A coherent paragraph summarizing the information
    - facts: An array of distinct factual statements extracted from the results
    - source_urls: An array of the most relevant source URLs
    `;

    const result = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 1000
    });
    
    logger.info('Web results summarized:', { 
      query: originalQuery,
      summary_length: result.summary.length,
      facts_count: result.facts.length
    });
    
    return {
      ...result,
      source: 'web_search_summary',
      query: originalQuery
    };
  } catch (error) {
    logger.error('Error summarizing web results:', error);
    return {
      summary: 'Failed to summarize web search results due to an error.',
      facts: [],
      source_urls: [],
      source: 'web_search_summary',
      query: originalQuery
    };
  }
}

/**
 * Search the web and summarize results
 * @param {string} query - Search query
 * @returns {Promise<Object>} Summarized web information
 */
async function searchAndSummarize(query) {
  try {
    const searchResults = await performWebSearch(query);
    const summary = await summarizeWebResults(searchResults, query);
    
    return summary;
  } catch (error) {
    logger.error('Error in search and summarize:', error);
    return {
      summary: 'Failed to retrieve and summarize web information.',
      facts: [],
      source_urls: [],
      source: 'web_search_summary',
      query: query
    };
  }
}

module.exports = {
  searchAndSummarize,
  performWebSearch,
  summarizeWebResults
};