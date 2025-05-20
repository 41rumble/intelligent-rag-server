const mongoClient = require('../utils/mongoClient');
const vectorStore = require('../utils/vectorStore');
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
    
    // Search vectors in FAISS
    const vectorResults = await vectorStore.searchVectors(projectId, queryEmbedding, limit);
    
    // Get full documents from MongoDB using vector IDs
    const documents = await Promise.all(
      vectorResults.map(async result => {
        const doc = await collection.findOne({ vector_id: result.id });
        if (doc) {
          doc.score = result.score;
        }
        return doc;
      })
    );
    
    // Filter out null results and sort by score
    const results = documents
      .filter(doc => doc !== null)
      .sort((a, b) => b.score - a.score);
    
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
    const { projectId } = queryInfo;
    const collection = await mongoClient.getProjectCollection(projectId);
    
    // Get book metadata for time period context
    const bookMetadata = await getBookMetadata(projectId);
    
    // Build filter based on available metadata
    const filter = { project: projectId };
    
    // Add time period filter if available
    if (bookMetadata?.time_period) {
      filter.$or = [
        { 'timeline_data.date': { $regex: bookMetadata.time_period.start, $options: 'i' } },
        { 'timeline_data.date': { $regex: bookMetadata.time_period.end, $options: 'i' } },
        { 'timeline_data.time_period': { 
          $regex: `${bookMetadata.time_period.start}.*${bookMetadata.time_period.end}`, 
          $options: 'i' 
        } }
      ];
    }
    
    // Add tag filters if available
    const tagFilters = [];
    
    if (tagFilters.length > 0) {
      filter.tags = { $in: tagFilters };
    }
    
    const results = await collection.find(filter)
      .sort({ priority: -1 })
      .limit(limit)
      .toArray();
    
    logger.info('Metadata search completed:', { 
      projectId,
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
/**
 * Get book metadata for a project
 * @param {string} projectId - Project identifier
 * @returns {Promise<Object>} Book metadata
 */
async function getBookMetadata(projectId) {
  try {
    const collection = await mongoClient.getProjectCollection(projectId);
    const metadata = await collection.findOne({ type: 'book_metadata' });
    return metadata;
  } catch (error) {
    logger.error('Error getting book metadata:', error);
    return null;
  }
}

async function retrieveDocuments(query, queryInfo, limit = 10) {
  try {
    const projectId = queryInfo.projectId;
    
    // Get book metadata first
    const bookMetadata = await getBookMetadata(projectId);
    
    logger.info('Starting sequential document retrieval:', {
      query,
      projectId,
      book_title: bookMetadata?.title,
      search_types: ['vector', 'metadata', 'text']
    });

    // Run vector search first as it's most relevant
    const vectorResults = await vectorSearch(query, projectId, limit);
    logger.info('Vector search completed', { count: vectorResults.length });

    // Then metadata search to add context
    const metadataResults = await metadataSearch(queryInfo, limit);
    logger.info('Metadata search completed', { count: metadataResults.length });

    // Finally text search for any missing information
    const textResults = await textSearch(query, projectId, limit);
    logger.info('Text search completed', { count: textResults.length });

    logger.info('Individual search results:', {
      vector_count: vectorResults.length,
      vector_ids: vectorResults.map(doc => doc._id),
      metadata_count: metadataResults.length,
      metadata_ids: metadataResults.map(doc => doc._id),
      text_count: textResults.length,
      text_ids: textResults.map(doc => doc._id)
    });
    
    // Combine and deduplicate results
    const combinedResults = combineResults([
      vectorResults,
      metadataResults,
      textResults
    ]);
    
    // Add book metadata to results if available
    if (bookMetadata) {
      const bookContext = {
        book_title: bookMetadata.title,
        book_author: bookMetadata.author,
        time_period: bookMetadata.time_period,
        publication_year: bookMetadata.publication_year
      };
      
      combinedResults.forEach(doc => {
        doc.book_context = bookContext;
      });
    }
    
    // Limit to requested number
    const finalResults = combinedResults.slice(0, limit);
    
    logger.info('Document retrieval completed:', { 
      query,
      projectId,
      total_results_before_dedup: vectorResults.length + metadataResults.length + textResults.length,
      unique_results: combinedResults.length,
      final_results: finalResults.length,
      final_doc_types: finalResults.map(doc => doc.type),
      final_doc_ids: finalResults.map(doc => doc._id),
      final_priorities: finalResults.map(doc => doc.priority)
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