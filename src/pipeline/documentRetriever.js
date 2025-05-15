const mongoClient = require('../utils/mongoClient');
const logger = require('../utils/logger');
const { generateEmbedding } = require('../utils/llmProvider');
require('dotenv').config();

/**
 * Generate embedding for query text
 * @param {string} query - Query text
 * @returns {Promise<Array>} Embedding vector
 */
async function generateQueryEmbedding(query) {
  try {
    return await generateEmbedding(query);
  } catch (error) {
    logger.error('Error generating query embedding:', error);
    throw error;
  }
}

/**
 * Retrieve documents using vector search
 * @param {string} query - Query text
 * @param {string} projectId - Project identifier
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Retrieved documents
 */
async function vectorSearch(query, projectId, limit = 5) {
  try {
    const collection = await mongoClient.getProjectCollection(projectId);
    const queryEmbedding = await generateQueryEmbedding(query);
    
    const results = await collection.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 3,
          limit: limit
        }
      },
      {
        $project: {
          _id: 1,
          type: 1,
          project: 1,
          name: 1,
          text: 1,
          title: 1,
          tags: 1,
          time_period: 1,
          priority: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]).toArray();
    
    logger.info('Vector search completed:', { 
      query, 
      project_id: projectId,
      results_count: results.length
    });
    
    return results;
  } catch (error) {
    logger.error('Error in vector search:', error);
    return [];
  }
}

/**
 * Retrieve documents using metadata filters
 * @param {Object} queryInfo - Classified query information
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Retrieved documents
 */
async function metadataSearch(queryInfo, limit = 5) {
  try {
    const { project_id, people, locations, time_periods, topics } = queryInfo;
    const collection = await mongoClient.getProjectCollection(project_id);
    
    // Build filter based on available metadata
    const filter = { project: project_id };
    
    // Add tag filters if available
    const tagFilters = [
      ...people,
      ...locations,
      ...time_periods,
      ...topics
    ].filter(Boolean);
    
    if (tagFilters.length > 0) {
      filter.tags = { $in: tagFilters };
    }
    
    const results = await collection.find(filter)
      .sort({ priority: -1 })
      .limit(limit)
      .toArray();
    
    logger.info('Metadata search completed:', { 
      project_id,
      filter,
      results_count: results.length
    });
    
    return results;
  } catch (error) {
    logger.error('Error in metadata search:', error);
    return [];
  }
}

/**
 * Retrieve documents using text search
 * @param {string} query - Query text
 * @param {string} projectId - Project identifier
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Retrieved documents
 */
async function textSearch(query, projectId, limit = 5) {
  try {
    const collection = await mongoClient.getProjectCollection(projectId);
    
    const results = await collection.find(
      { 
        $text: { $search: query },
        project: projectId
      },
      {
        score: { $meta: 'textScore' }
      }
    )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray();
    
    logger.info('Text search completed:', { 
      query, 
      project_id: projectId,
      results_count: results.length
    });
    
    return results;
  } catch (error) {
    logger.error('Error in text search:', error);
    return [];
  }
}

/**
 * Combine results from multiple search methods
 * @param {Array} results - Array of search results
 * @returns {Array} Deduplicated and ranked results
 */
function combineResults(results) {
  // Create a map to deduplicate by _id
  const combinedMap = new Map();
  
  // Process all result sets
  results.forEach(resultSet => {
    resultSet.forEach(doc => {
      const existingDoc = combinedMap.get(doc._id);
      
      if (!existingDoc || (doc.score && (!existingDoc.score || doc.score > existingDoc.score))) {
        combinedMap.set(doc._id, doc);
      }
    });
  });
  
  // Convert map to array and sort by priority and score
  return Array.from(combinedMap.values())
    .sort((a, b) => {
      // First by priority (higher first)
      const priorityDiff = (b.priority || 0) - (a.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by score if available (higher first)
      return (b.score || 0) - (a.score || 0);
    });
}

/**
 * Retrieve documents for a query using multiple search methods
 * @param {string} query - Query text
 * @param {Object} queryInfo - Classified query information
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Retrieved documents
 */
async function retrieveDocuments(query, queryInfo, limit = 10) {
  try {
    const projectId = queryInfo.project_id;
    
    // Run searches in parallel
    const [vectorResults, metadataResults, textResults] = await Promise.all([
      vectorSearch(query, projectId, limit),
      metadataSearch(queryInfo, limit),
      textSearch(query, projectId, limit)
    ]);
    
    // Combine and deduplicate results
    const combinedResults = combineResults([
      vectorResults,
      metadataResults,
      textResults
    ]);
    
    // Limit to requested number
    const finalResults = combinedResults.slice(0, limit);
    
    logger.info('Document retrieval completed:', { 
      query,
      project_id: projectId,
      results_count: finalResults.length
    });
    
    return finalResults;
  } catch (error) {
    logger.error('Error retrieving documents:', error);
    return [];
  }
}

module.exports = {
  retrieveDocuments,
  vectorSearch,
  metadataSearch,
  textSearch
};