const logger = require('../utils/logger');
const { getProjectCollection } = require('../utils/mongoClient');

/**
 * Store relationship data in MongoDB
 * @param {string} projectId - Project identifier
 * @param {Array} relationships - Array of relationship objects
 */
async function storeRelationships(projectId, relationships) {
  try {
    const collection = await getProjectCollection(projectId);
    
    // Create relationships collection if it doesn't exist
    const relationshipsCollection = await getProjectCollection(`${projectId}_relationships`);
    
    // Store each relationship
    for (const relationship of relationships) {
      const key = `${relationship.source_character}__${relationship.target_character}`;
      
      // Add metadata
      const relationshipDoc = {
        ...relationship,
        project: projectId,
        type: 'character_relationship',
        created_at: new Date(),
        updated_at: new Date(),
        key
      };
      
      // Upsert the relationship
      await relationshipsCollection.updateOne(
        { key },
        { $set: relationshipDoc },
        { upsert: true }
      );
      
      logger.info(`Stored relationship between ${relationship.source_character} and ${relationship.target_character}`);
    }
    
    // Create indexes if they don't exist
    const indexes = await relationshipsCollection.listIndexes().toArray();
    
    if (!indexes.some(index => index.name === 'relationship_search_index')) {
      await relationshipsCollection.createIndex(
        {
          source_character: 'text',
          target_character: 'text',
          'type.primary': 'text',
          'co_occurrences.raw_text': 'text'
        },
        {
          name: 'relationship_search_index',
          weights: {
            source_character: 10,
            target_character: 10,
            'type.primary': 5,
            'co_occurrences.raw_text': 1
          }
        }
      );
      logger.info('Created text search index for relationships');
    }
    
    if (!indexes.some(index => index.name === 'character_index')) {
      await relationshipsCollection.createIndex(
        { source_character: 1, target_character: 1 },
        { name: 'character_index', unique: true }
      );
      logger.info('Created character index for relationships');
    }
    
    logger.info(`Successfully stored ${relationships.length} relationships for project ${projectId}`);
  } catch (error) {
    logger.error('Error storing relationships:', error);
    throw error;
  }
}

/**
 * Get relationships for a character
 * @param {string} projectId - Project identifier
 * @param {string} characterName - Character name
 * @returns {Promise<Array>} Array of relationships
 */
async function getCharacterRelationships(projectId, characterName) {
  try {
    const collection = await getProjectCollection(`${projectId}_relationships`);
    
    // Find relationships where character is either source or target
    const relationships = await collection.find({
      $or: [
        { source_character: characterName },
        { target_character: characterName }
      ]
    }).toArray();
    
    return relationships;
  } catch (error) {
    logger.error('Error getting character relationships:', error);
    throw error;
  }
}

/**
 * Search relationships by text
 * @param {string} projectId - Project identifier
 * @param {string} searchText - Text to search for
 * @returns {Promise<Array>} Array of matching relationships
 */
async function searchRelationships(projectId, searchText) {
  try {
    const collection = await getProjectCollection(`${projectId}_relationships`);
    
    const relationships = await collection.find({
      $text: { $search: searchText }
    }).toArray();
    
    return relationships;
  } catch (error) {
    logger.error('Error searching relationships:', error);
    throw error;
  }
}

module.exports = {
  storeRelationships,
  getCharacterRelationships,
  searchRelationships
};