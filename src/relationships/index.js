const { getProjectCollection } = require('../utils/mongoClient');
const logger = require('../utils/logger');
const { 
  buildCharacterRelationships,
  buildSocialNetworks,
  buildThematicConnections,
  buildEventNetworks
} = require('./builders');

/**
 * Main relationship builder that orchestrates the entire process
 * @param {string} projectId - Project identifier
 */
async function buildRelationships(projectId) {
  logger.info(`Building relationships for project ${projectId}`);
  
  try {
    // Get collections
    const collection = await getProjectCollection(projectId);
    
    // 1. Load all character bios
    const bios = await collection.find({ 
      type: "bio"
    }).toArray();
    
    logger.info(`Found ${bios.length} character bios`);

    // 2. Load all chapters
    const chapters = await collection.find({
      type: "chapter_text"
    }).toArray();
    
    logger.info(`Found ${chapters.length} chapters`);

    // 3. Build different types of relationships
    const relationships = await buildCharacterRelationships(bios, chapters);
    const socialNetworks = await buildSocialNetworks(bios, chapters);
    const thematicConnections = await buildThematicConnections(bios, chapters);
    const eventNetworks = await buildEventNetworks(bios, chapters);

    // 4. Store all relationship data
    await storeRelationshipData(collection, {
      relationships,
      socialNetworks,
      thematicConnections,
      eventNetworks
    });

    logger.info('Relationship building completed successfully');
    
    return {
      relationships: relationships.length,
      socialNetworks: socialNetworks.length,
      thematicConnections: thematicConnections.length,
      eventNetworks: eventNetworks.length
    };
  } catch (error) {
    logger.error('Error building relationships:', error);
    throw error;
  }
}

/**
 * Store all relationship data in the database
 * @param {Collection} collection - MongoDB collection
 * @param {Object} data - Relationship data to store
 */
async function storeRelationshipData(collection, data) {
  // 1. Remove existing relationship data
  await collection.deleteMany({
    type: {
      $in: [
        "character_relationship",
        "social_network",
        "thematic_connection",
        "event_network"
      ]
    }
  });

  // 2. Store new relationship data
  if (data.relationships.length > 0) {
    await collection.insertMany(data.relationships);
  }
  
  if (data.socialNetworks.length > 0) {
    await collection.insertMany(data.socialNetworks);
  }
  
  if (data.thematicConnections.length > 0) {
    await collection.insertMany(data.thematicConnections);
  }
  
  if (data.eventNetworks.length > 0) {
    await collection.insertMany(data.eventNetworks);
  }
}

// Export the main builder function
module.exports = {
  buildRelationships
};