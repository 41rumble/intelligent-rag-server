const axios = require('axios');
const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
require('dotenv').config();

// SearXNG instance URL
const searxngInstance = process.env.SEARXNG_INSTANCE;

// Axios instance with custom config
const axiosInstance = axios.create({
  timeout: 5000, // 5 second timeout
  maxRedirects: 3,
  keepAlive: false // Don't keep connections alive
});

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 500; // 0.5 second
const TOTAL_TIMEOUT = 10000; // 10 seconds total timeout

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
  const startTime = Date.now();
  
  try {
    return await requestFn();
  } catch (error) {
    if (retries > 0 && (Date.now() - startTime) < TOTAL_TIMEOUT) {
      logger.warn(`Request failed, retrying... (${retries} attempts remaining)`, {
        error: error.message,
        code: error.code,
        elapsed: Date.now() - startTime
      });
      await sleep(RETRY_DELAY);
      return withRetry(requestFn, retries - 1);
    }
    if ((Date.now() - startTime) >= TOTAL_TIMEOUT) {
      throw new Error('Total timeout exceeded');
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
    4. Uses [WEB1], [WEB2], etc. to cite sources
    
    Example format:
    "Asa Jennings arrived in Smyrna in August 1922 [WEB1]. During the Great Fire, he worked with both Greek and Turkish authorities [WEB2][WEB3] to coordinate evacuation efforts."
    
    Format your response as a JSON object with:
    - summary: A coherent paragraph with [WEB1], [WEB2] etc. citations
    - facts: Array of objects with:
      * text: The factual statement
      * sources: Array of source numbers (1, 2, etc.)
    - source_urls: Array of objects with:
      * id: "WEB1", "WEB2", etc.
      * url: The source URL
      * title: The source title
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