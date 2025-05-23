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
  Quick analysis task for query: "${originalQuery}"

  Content to analyze:
  "${result.content}"

  Title: ${result.title}
  URL: ${result.url}

  Return ONLY a JSON object with:
  {
    "is_relevant": boolean (true if content helps answer query),
    "relevance_score": number 1-10 (higher = more directly answers query),
    "key_points": [
      "only facts that directly help answer the query",
      "no general information",
      "focus on naval/military involvement"
    ],
    "reasoning": "one line explaining relevance"
  }
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

    // Process results in batches of 3
    const BATCH_SIZE = 3;
    const batches = [];
    for (let i = 0; i < searchResults.length; i += BATCH_SIZE) {
      batches.push(searchResults.slice(i, i + BATCH_SIZE));
    }

    logger.info('Processing search results in batches:', {
      total_results: searchResults.length,
      batch_size: BATCH_SIZE,
      num_batches: batches.length
    });

    // Process each batch
    let allRelevantAnalyses = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.info(`Processing batch ${i + 1}/${batches.length}`);

      // Analyze batch
      const batchAnalyses = await Promise.all(
        batch.map((result, idx) => 
          analyzeSearchResult(result, i * BATCH_SIZE + idx + 1, originalQuery)
        )
      );

      // Filter relevant results from this batch
      const relevantFromBatch = batchAnalyses.filter(a => a.is_relevant && a.relevance_score > 3);
      allRelevantAnalyses.push(...relevantFromBatch);

      logger.info(`Batch ${i + 1} analysis:`, {
        batch_size: batch.length,
        relevant_found: relevantFromBatch.length,
        scores: relevantFromBatch.map(a => a.relevance_score)
      });
    }

    logger.info('All batches processed:', {
      total_analyzed: searchResults.length,
      total_relevant: allRelevantAnalyses.length,
      avg_score: allRelevantAnalyses.length > 0 
        ? allRelevantAnalyses.reduce((sum, a) => sum + a.relevance_score, 0) / allRelevantAnalyses.length 
        : 0
    });

    if (allRelevantAnalyses.length === 0) {
      return {
        summary: 'No relevant web search results found.',
        facts: [],
        source_urls: []
      };
    }

    // Sort by relevance and take top results
    allRelevantAnalyses.sort((a, b) => b.relevance_score - a.relevance_score);
    const topResults = allRelevantAnalyses.slice(0, 5); // Only use top 5 most relevant

    // Second pass: Synthesize top relevant results
    const combinedPrompt = `
    Query: "${originalQuery}"

    Synthesize these key points:
    ${topResults.map(a => `
    [WEB${a.result_index}] ${a.title}
    ${a.key_points.map(p => `* ${p}`).join('\n')}
    `).join('\n\n')}

    Return ONLY a JSON object with:
    {
      "summary": "Focused answer with [WEB1] style citations",
      "facts": [
        {
          "text": "Specific fact about naval/military involvement",
          "relevance": "How this fact answers the query",
          "sources": [1, 2] // Source numbers
        }
      ],
      "source_urls": [
        {
          "id": "WEB1",
          "url": "source url",
          "title": "source title",
          "relevance_score": 1-10
        }
      ]
    }
    `;

    try {
      const response = await generateStructuredResponse(combinedPrompt, {
        temperature: 0.3,
        systemPrompt: "You are a synthesis assistant. Combine information accurately and cite sources."
      });

      // Validate response structure
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response structure from synthesis');
      }

      // Initialize missing fields
      response.summary = response.summary || 'No summary generated';
      response.facts = Array.isArray(response.facts) ? response.facts : [];
      response.source_urls = response.source_urls || [];

      // Add source information from our top results
      response.source_urls = topResults.map(a => ({
        id: `WEB${a.result_index}`,
        url: a.url,
        title: a.title,
        relevance_score: a.relevance_score
      }));

      logger.info('Web results synthesized:', {
        query: originalQuery,
        summary_length: response.summary.length,
        facts_count: response.facts.length,
        sources: response.source_urls.length,
        top_scores: topResults.map(r => r.relevance_score)
      });

      return {
        ...response,
        source: 'web_search_summary',
        query: originalQuery,
        metadata: {
          total_analyzed: searchResults.length,
          total_relevant: allRelevantAnalyses.length,
          avg_relevance: allRelevantAnalyses.length > 0 
            ? allRelevantAnalyses.reduce((sum, a) => sum + a.relevance_score, 0) / allRelevantAnalyses.length 
            : 0,
          top_result_count: topResults.length
        }
      };
    } catch (error) {
      logger.error('Error in synthesis step:', {
        error: error.message,
        topResults_length: topResults.length,
        prompt_length: combinedPrompt.length
      });

      // Return a valid structure even on error
      return {
        summary: 'Failed to synthesize web search results.',
        facts: [],
        source_urls: topResults.map(a => ({
          id: `WEB${a.result_index}`,
          url: a.url,
          title: a.title,
          relevance_score: a.relevance_score
        })),
        source: 'web_search_summary',
        query: originalQuery,
        error: error.message
      };
    }
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
