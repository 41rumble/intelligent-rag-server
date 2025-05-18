const logger = require('../../utils/logger');
const vectorStore = require('../../utils/vectorStore');
const mongoClient = require('../../utils/mongoClient');
const { generateEmbedding } = require('../../utils/llmProvider');
const { default: axios } = require('axios');

/**
 * Service for searching across multiple data sources
 */
class MultiSourceSearch {
  constructor(projectId) {
    this.projectId = projectId;
  }

  /**
   * Perform RAG search using vector similarity
   * @param {string} query - Search query
   * @param {number} k - Number of results to return
   * @returns {Promise<Array>} Search results
   */
  async ragSearch(query, k = 3) {
    try {
      // Generate embedding for query
      const embedding = await generateEmbedding(query);
      
      // Search vectors
      const results = await vectorStore.searchVectors(this.projectId, embedding, k);
      
      // Get documents from MongoDB using vector IDs
      const collection = await mongoClient.getProjectCollection(this.projectId);
      const docs = await collection.find({
        vector_id: { $in: results.map(r => r.id) }
      }).toArray();

      // Combine vector search results with documents
      return results.map(result => {
        const doc = docs.find(d => d.vector_id === result.id);
        return {
          source: 'rag',
          score: result.score,
          content: doc.text,
          metadata: {
            type: doc.type,
            title: doc.title || doc.name,
            time_period: doc.time_period,
            locations: doc.locations,
            events: doc.events,
            source_files: doc.source_files
          }
        };
      });
    } catch (error) {
      logger.error('Error in RAG search:', error);
      return [];
    }
  }

  /**
   * Search MongoDB for related entities
   * @param {string} query - Search query
   * @returns {Promise<Array>} Search results
   */
  async dbSearch(query) {
    try {
      const collection = await mongoClient.getProjectCollection(this.projectId);
      
      // Perform text search
      const results = await collection.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(5)
      .toArray();

      return results.map(doc => ({
        source: 'db',
        score: doc.score,
        content: doc.text,
        metadata: {
          type: doc.type,
          title: doc.title || doc.name,
          time_period: doc.time_period,
          locations: doc.locations,
          events: doc.events,
          relationships: doc.relationships,
          source_files: doc.source_files
        }
      }));
    } catch (error) {
      logger.error('Error in DB search:', error);
      return [];
    }
  }

  /**
   * Search web sources for additional context using SearXNG
   * @param {string} query - Search query
   * @param {Object} context - Search context
   * @returns {Promise<Array>} Search results
   */
  async webSearch(query, context = {}) {
    try {
      const webSearch = require('../../utils/webSearch');
      const results = await webSearch.contextSearch(query, context);
      
      return results.map(result => ({
        source: 'web',
        score: result.score,
        content: result.content,
        metadata: {
          title: result.title,
          url: result.url,
          date: result.date,
          engine: result.source
        }
      }));
    } catch (error) {
      logger.error('Error in web search:', error);
      return [];
    }
  }

  /**
   * Perform search across all sources based on thinking depth
   * @param {Object} expandedQuery - Expanded query object
   * @param {number} level - Thinking depth level (1-4)
   * @returns {Promise<Object>} Combined search results
   */
  async search(expandedQuery, level = 1) {
    const results = {
      rag: [],
      db: [],
      web: []
    };

    // Level 1: Basic RAG
    if (level >= 1) {
      results.rag = await this.ragSearch(
        expandedQuery.original,
        level >= 4 ? 7 : 3  // Increase K for level 4
      );

      // Add results from context queries
      for (const query of expandedQuery.context_queries) {
        const contextResults = await this.ragSearch(query, 2);
        results.rag.push(...contextResults);
      }
    }

    // Level 2: Add DB Relations
    if (level >= 2) {
      results.db = await this.dbSearch(expandedQuery.original);
      
      // Add results from relationship queries
      for (const query of expandedQuery.relationship_queries) {
        const relationResults = await this.dbSearch(query);
        results.db.push(...relationResults);
      }
    }

    // Level 3 & 4: Add Web Search
    if (level >= 3) {
      results.web = await this.webSearch(expandedQuery.original);
      
      // Level 4: Add more web results from expanded queries
      if (level >= 4) {
        for (const query of [
          ...expandedQuery.temporal_queries,
          ...expandedQuery.relationship_queries
        ]) {
          const webResults = await this.webSearch(query);
          results.web.push(...webResults);
        }
      }
    }

    return results;
  }
}

module.exports = MultiSourceSearch;