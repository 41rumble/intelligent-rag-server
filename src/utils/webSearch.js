const axios = require('axios');
const logger = require('./logger');

class WebSearch {
  constructor() {
    this.searxngInstance = process.env.SEARXNG_INSTANCE || 'http://localhost:8880';
  }

  /**
   * Clean and format search results
   * @param {Object} result - Raw search result
   * @returns {Object} Cleaned result
   */
  cleanResult(result) {
    return {
      title: result.title,
      url: result.url,
      content: result.content,
      source: result.engine,
      date: result.publishedDate,
      score: result.score || 1.0
    };
  }

  /**
   * Search using SearXNG
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async search(query, options = {}) {
    const defaultOptions = {
      format: 'json',
      engines: ['wikipedia', 'wikidata', 'google', 'bing'],
      language: 'en',
      time_range: options.timeRange || '',
      max_results: options.maxResults || 10
    };

    try {
      logger.debug(`Searching SearXNG for: ${query}`);
      const response = await axios.get(`${this.searxngInstance}/search`, {
        params: {
          q: query,
          ...defaultOptions
        }
      });

      if (!response.data || !response.data.results) {
        logger.warn('No results from SearXNG');
        return [];
      }

      // Clean and filter results
      const results = response.data.results
        .map(result => this.cleanResult(result))
        .filter(result => result.content && result.content.length > 50);

      logger.debug(`Found ${results.length} results from SearXNG`);
      return results;
    } catch (error) {
      logger.error('SearXNG search error:', error);
      return [];
    }
  }

  /**
   * Search with multiple queries and aggregate results
   * @param {Array<string>} queries - Array of search queries
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Aggregated results
   */
  async multiSearch(queries, options = {}) {
    const allResults = await Promise.all(
      queries.map(query => this.search(query, options))
    );

    // Merge results and remove duplicates
    const uniqueResults = new Map();
    allResults.flat().forEach(result => {
      if (!uniqueResults.has(result.url)) {
        uniqueResults.set(result.url, result);
      }
    });

    return Array.from(uniqueResults.values());
  }

  /**
   * Search with context awareness
   * @param {string} query - Main query
   * @param {Object} context - Search context
   * @returns {Promise<Array>} Contextualized results
   */
  async contextSearch(query, context = {}) {
    const { time_period, locations, events } = context;
    
    // Build context-aware queries
    const queries = [query];
    
    if (time_period) {
      queries.push(`${query} ${time_period}`);
    }

    if (locations && locations.length > 0) {
      queries.push(`${query} ${locations.join(' ')}`);
    }

    if (events && events.length > 0) {
      queries.push(`${query} ${events.join(' ')}`);
    }

    return this.multiSearch(queries, {
      timeRange: time_period ? 'year' : '',
      maxResults: Math.floor(20 / queries.length) // Distribute results across queries
    });
  }
}

module.exports = new WebSearch();