const fs = require('fs').promises;
const path = require('path');
const mongoClient = require('../src/utils/mongoClient');
const logger = require('../src/utils/logger');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const relationshipsPath = path.join(projectPath, 'relationships');

/**
 * Process and store relationship maps
 * @returns {Promise<void>}
 */
async function processRelationshipMaps() {
  try {
    // Use the main project collection
    const collection = await mongoClient.getProjectCollection(projectId);
    
    // Get all relationship files
    const mapFiles = await fs.readdir(relationshipsPath);
    logger.info(`Found ${mapFiles.length} relationships to process`);
    
    for (const file of mapFiles) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(relationshipsPath, file);
      const mapData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      // Validate and transform relationship map data
      function validateMapForMongo(map) {
        // Ensure required fields exist and are the right type
        const result = {
          source_character: String(map.source_character || ''),
          target_character: String(map.target_character || ''),
          relationship_type: String(map.relationship_type || 'unknown'),
          sentiment: parseFloat(map.sentiment) || 0,
          power_dynamic: String(map.power_dynamic || 'unknown'),
          key_moments: [],
          progression: {
            initial_state: 0,
            current_state: 0,
            significant_changes: []
          }
        };

        // Process key moments
        if (Array.isArray(map.key_moments)) {
          result.key_moments = map.key_moments.map(moment => ({
            chapter: String(moment.chapter || 'unknown'),
            description: String(moment.description || ''),
            significance: String(moment.significance || 'medium')
          }));
        }

        // Process progression data
        if (map.progression && typeof map.progression === 'object') {
          result.progression = {
            initial_state: parseFloat(map.progression.initial_state) || 0,
            current_state: parseFloat(map.progression.current_state) || 0,
            significant_changes: []
          };

          if (Array.isArray(map.progression.significant_changes)) {
            result.progression.significant_changes = map.progression.significant_changes.map(change => ({
              chapter: String(change.chapter || 'unknown'),
              from: parseFloat(change.from) || 0,
              to: parseFloat(change.to) || 0,
              cause: String(change.cause || '')
            }));
          }
        }

        // Add priority and source tracking
        result.priority = parseInt(map.priority) || 1;
        result.source_files = Array.isArray(map.source_files) ? 
          map.source_files.map(String) : 
          [file];

        return result;
      }

      // Validate and transform map data
      const validatedMap = validateMapForMongo(mapData);

      // Generate a unique key for the relationship
      const key = `${validatedMap.source_character}__${validatedMap.target_character}`;

      // Prepare document for MongoDB
      const document = {
        _id: `relationship_${key}`,
        type: 'character_relationship',
        project: projectId,
        ...validatedMap,
        // Required field 'text' for schema validation - combine key info
        text: `Relationship between ${validatedMap.source_character} and ${validatedMap.target_character}: ${validatedMap.relationship_type}`,
        key,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // Insert or update document
      await collection.updateOne(
        { _id: document._id },
        { $set: document },
        { upsert: true }
      );
      
      logger.info(`Processed relationship map: ${file}`);
    }
    
    logger.info('All relationship maps processed successfully');

    // Create indexes if they don't exist
    const indexes = await collection.listIndexes().toArray();
    
    if (!indexes.some(index => index.name === 'relationship_search_index')) {
      await collection.createIndex(
        {
          source_character: 'text',
          target_character: 'text',
          relationship_type: 'text',
          'key_moments.description': 'text'
        },
        {
          name: 'relationship_search_index',
          weights: {
            source_character: 10,
            target_character: 10,
            relationship_type: 5,
            'key_moments.description': 1
          }
        }
      );
      logger.info('Created text search index for relationships');
    }
    
    if (!indexes.some(index => index.name === 'character_relationship_index')) {
      await collection.createIndex(
        { source_character: 1, target_character: 1 },
        { name: 'character_relationship_index', unique: true }
      );
      logger.info('Created character relationship index');
    }

  } catch (error) {
    logger.error('Error processing relationship maps:', error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Initialize MongoDB collection with schema validation
    await mongoClient.initializeCollection(projectId);
    
    // Process relationship maps
    await processRelationshipMaps();
    
    logger.info('All relationship maps processed and stored successfully');
  } catch (error) {
    logger.error('Error in main process:', error);
  } finally {
    // Close MongoDB connection
    await mongoClient.close();
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  processRelationshipMaps
};