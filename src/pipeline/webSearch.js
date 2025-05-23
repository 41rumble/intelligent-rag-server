const axios = require('axios');
const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
const { validateJsonResponse } = require('../utils/jsonValidator');
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
async function performWebSearch(query, queryInfo, numResults = 8) {
  logger.info('Starting web search:', {
    query,
    queryInfo,
    initial_numResults: numResults,
    searxng_instance: searxngInstance
  });

  // Increase results when query is factual or RAG might lack info
  if (queryInfo?.query_type === 'factual' || 
      queryInfo?.analytical_requirements?.context_needed?.includes('factual')) {
    numResults = 12; // Get more results for factual queries
    logger.info('Increased results for factual query:', { numResults });
  }

  try {
    if (!searxngInstance) {
      logger.warn('SearXNG instance URL not configured');
      return [];
    }

    // Validate and sanitize the URL
    let searchUrl;
    try {
      if (searxngInstance.includes('localhost')) {
        // Force HTTP for localhost
        searchUrl = new URL('/search', searxngInstance.replace('https://', 'http://')).toString();
      } else {
        searchUrl = new URL('/search', searxngInstance).toString();
      }
      logger.info('Constructed search URL:', {
        original_instance: searxngInstance,
        final_url: searchUrl
      });
    } catch (urlError) {
      logger.error('Error constructing search URL:', {
        instance: searxngInstance,
        error: urlError.message
      });
      throw urlError;
    }
    
    const requestParams = {
      q: query,
      format: 'json',
      categories: 'general',
      language: 'en-US',
      time_range: '',
      engines: 'google,bing,duckduckgo',
      max_results: numResults
    };

    logger.info('Preparing search request:', {
      url: searchUrl,
      params: requestParams
    });

    const makeRequest = () => axiosInstance.get(searchUrl, {
      params: requestParams,
      validateStatus: status => status >= 200 && status < 300
    });

    const response = await withRetry(makeRequest);
    const results = response.data.results || [];
    
    // Log detailed search results
    logger.info('Web search completed:', { 
      query, 
      results_count: results.length,
      instance: searxngInstance,
      results: results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content.substring(0, 150) + '...' // Log first 150 chars of content
      }))
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
 * Quick analysis of a single search result
 */
async function analyzeSearchResult(result, index, originalQuery) {
  const prompt = `
  Analyze this search result for the query: "${originalQuery}"

  RESULT:
  Title: ${result.title}
  URL: ${result.url}
  Content: ${result.content}

  Quickly determine:
  1. Is this result relevant to the query?
  2. What specific information helps answer the query?
  3. Rate relevance from 1-10

  Format response as JSON with:
  - is_relevant: boolean
  - relevance_score: number 1-10
  - key_points: Array of short, relevant facts (empty if not relevant)
  - reasoning: Brief explanation of relevance/irrelevance
  `;

  try {
    const analysis = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      systemPrompt: "You are a quick analysis assistant. Be concise and focus only on relevance to the query."
    });

    return {
      ...analysis,
      result_index: index,
      url: result.url,
      title: result.title
    };
  } catch (error) {
    logger.warn(`Failed to analyze result ${index}`, { error: error.message });
    return {
      is_relevant: false,
      relevance_score: 0,
      key_points: [],
      reasoning: "Analysis failed",
      result_index: index,
      url: result.url,
      title: result.title
    };
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

    // First pass: Quick analysis of each result
    logger.info('Starting individual result analysis');
    const analysisPromises = searchResults.map((result, index) => 
      analyzeSearchResult(result, index + 1, originalQuery)
    );
    const analyses = await Promise.all(analysisPromises);

    // Filter relevant results
    const relevantAnalyses = analyses.filter(a => a.is_relevant && a.relevance_score > 3);
    logger.info('Relevant results found:', {
      total: searchResults.length,
      relevant: relevantAnalyses.length,
      scores: relevantAnalyses.map(a => a.relevance_score)
    });

    if (relevantAnalyses.length === 0) {
      return {
        summary: 'No relevant web search results found.',
        facts: [],
        source_urls: []
      };
    }

    // Second pass: Combine relevant information
    const combinedPrompt = `
    Synthesize these relevant search results for the query: "${originalQuery}"

    RELEVANT FINDINGS:
    ${relevantAnalyses.map(a => `
    [WEB${a.result_index}] ${a.title}
    Relevance: ${a.relevance_score}/10
    Key Points:
    ${a.key_points.map(p => `- ${p}`).join('\n')}
    `).join('\n')}

    Create a comprehensive answer that:
    1. Combines related information
    2. Resolves any contradictions
    3. Uses [WEB1], [WEB2] etc. citations
    4. Focuses on answering the original query

    Format response as JSON with:
    - summary: A coherent paragraph with citations
    - facts: Array of objects with:
      * text: The factual statement
      * relevance: How it helps answer the query
      * sources: Array of source numbers
    - source_urls: Array of objects with:
      * id: "WEB1", "WEB2", etc.
      * url: The source URL
      * title: The source title
      * relevance_score: 1-10 rating
    `;

    const response = await generateStructuredResponse(combinedPrompt, {
      temperature: 0.3,
      systemPrompt: "You are a synthesis assistant. Combine information accurately and cite sources."
    });

    // Add source information
    response.source_urls = relevantAnalyses.map(a => ({
      id: `WEB${a.result_index}`,
      url: a.url,
      title: a.title,
      relevance_score: a.relevance_score
    }));

    logger.info('Web results synthesized:', {
      query: originalQuery,
      summary_length: response.summary.length,
      facts_count: response.facts.length,
      sources: response.source_urls.length
    });

    return {
      ...response,
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
async function searchAndSummarize(query, queryInfo = {}) {
  try {
    logger.info('Starting web search and summarize:', {
      query,
      queryInfo
    });

    // Default query info if not provided
    const defaultQueryInfo = {
      query_type: 'general',
      analytical_requirements: {
        context_needed: []
      }
    };
    
    logger.info('Using query info:', {
      provided: queryInfo,
      default: defaultQueryInfo,
      final: queryInfo || defaultQueryInfo
    });
    
    const searchResults = await performWebSearch(query, queryInfo || defaultQueryInfo);
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
