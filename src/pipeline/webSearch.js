const axios = require('axios');
const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
require('dotenv').config();

// SearXNG instance URL
const searxngInstance = process.env.SEARXNG_INSTANCE;

// Axios instance with custom config
const axiosInstance = axios.create({
  timeout: 10000, // 10 second timeout
  maxRedirects: 5
});

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Sleep function for retry delay
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after ms milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Perform request with retry logic
 * @param {Function} requestFn - Function that returns a promise
 * @param {number} retries - Number of retries remaining
 * @returns {Promise} Promise that resolves with the response
 */
async function withRetry(requestFn, retries = MAX_RETRIES) {
  try {
    return await requestFn();
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Request failed, retrying... (${retries} attempts remaining)`, {
        error: error.message,
        code: error.code
      });
      await sleep(RETRY_DELAY);
      return withRetry(requestFn, retries - 1);
    }
    throw error;
  }
}

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

    // Validate and sanitize the URL
    let searchUrl;
    if (searxngInstance.includes('localhost')) {
      // Force HTTP for localhost
      searchUrl = new URL('/search', searxngInstance.replace('https://', 'http://')).toString();
    } else {
      searchUrl = new URL('/search', searxngInstance).toString();
    }
    
    const makeRequest = () => axiosInstance.get(searchUrl, {
      params: {
        q: query,
        format: 'json',
        categories: 'general',
        language: 'en-US',
        time_range: '',
        engines: 'google,bing,duckduckgo',
        max_results: numResults
      },
      validateStatus: status => status >= 200 && status < 300
    });

    const response = await withRetry(makeRequest);
    const results = response.data.results || [];
    
    logger.info('Web search completed:', { 
      query, 
      results_count: results.length,
      instance: searxngInstance
    });
    
    return results.map(result => ({
      title: result.title,
      url: result.url,
      content: result.content,
      source: 'web_search'
    }));
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      protocol: error.protocol,
      instance: searxngInstance
    };

    // Log detailed error for debugging
    logger.error('Error performing web search:', errorDetails);

    // Check for specific error types
    if (error.code === 'EPROTO') {
      logger.error('SSL/TLS protocol error. The server might not support HTTPS or is using an incompatible protocol.');
    } else if (error.code === 'ECONNREFUSED') {
      logger.error('Connection refused. Please verify the SearXNG instance is running and accessible.');
    } else if (error.code === 'ERR_TLS_PROTOCOL_VERSION_CONFLICT') {
      logger.error('TLS protocol version conflict. Using default secure configuration.');
    } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      logger.error('Unable to verify SSL certificate. This is expected for self-signed certificates.');
    } else if (error.response?.status === 429) {
      logger.error('Rate limit exceeded. Consider reducing request frequency or increasing rate limits.');
    }

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
    logger.error('Error summarizing web results:', {
      message: error.message,
      code: error.code,
      type: error.type
    });
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
    logger.error('Error in search and summarize:', {
      message: error.message,
      code: error.code,
      type: error.type
    });
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