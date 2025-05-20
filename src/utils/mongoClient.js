const { MongoClient } = require('mongodb');
const logger = require('./logger');
require('dotenv').config();

// MongoDB connection string
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

// MongoDB client instance
let client;
let db;

/**
 * Connect to MongoDB
 * @returns {Promise<Object>} MongoDB database instance
 */
async function connect() {
  if (db) return db;
  
  try {
    logger.info(`Connecting to MongoDB at ${uri} (database: ${dbName})...`);
    client = new MongoClient(uri);
    await client.connect();
    
    // Get server info to verify connection
    const adminDb = client.db('admin');
    const serverInfo = await adminDb.command({ serverStatus: 1 });
    
    logger.info(`Successfully connected to MongoDB ${serverInfo.version} at ${uri}`);
    logger.info(`Using database: ${dbName}`);
    
    db = client.db(dbName);
    return db;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Close MongoDB connection
 */
async function close() {
  if (client) {
    await client.close();
    logger.info('MongoDB connection closed');
    client = null;
    db = null;
  }
}

/**
 * Get collection by name
 * @param {string} projectId - Project identifier
 * @returns {Promise<Collection>} MongoDB collection
 */
async function getProjectCollection(projectId) {
  const database = await connect();
  return database.collection(`project_${projectId}`);
}

// Vector search is now handled by FAISS in vectorStore.js

/**
 * Create text indexes for a collection if they don't exist
 * @param {string} projectId - Project identifier
 */
async function createTextIndexes(projectId) {
  const database = await connect();
  const collection = database.collection(`project_${projectId}`);
  
  // Check if index exists
  const indexes = await collection.listIndexes().toArray();
  const textIndexExists = indexes.some(index => index.name === 'text_search_index');
  
  if (!textIndexExists) {
    logger.info(`Creating text indexes for project_${projectId}`);
    await collection.createIndex(
      { 
        text: "text",
        name: "text",
        tags: "text",
        source_character: "text",
        target_character: "text",
        relationship_type: "text",
        "key_moments.description": "text"
      },
      { 
        name: "text_search_index",
        weights: {
          text: 1,
          name: 10,
          tags: 5,
          source_character: 10,
          target_character: 10,
          relationship_type: 5,
          "key_moments.description": 1
        }
      }
    );
    logger.info(`Text indexes created for project_${projectId}`);
  }
}

/**
 * Initialize collection with schema validation
 * @param {string} projectId - Project identifier
 */
async function initializeCollection(projectId) {
  const database = await connect();
  const collectionName = `project_${projectId}`;
  
  // Define schema
  const schema = {
    validator: {
      $jsonSchema: {
          bsonType: "object",
          required: ["type", "project", "text"],
          properties: {
            type: {
              bsonType: "string",
              enum: ["chapter_synopsis", "bio", "acknowledgement", "preface", "chapter_text", "character_relationship"]
            },
            project: {
              bsonType: "string"
            },
            name: {
              bsonType: "string"
            },
            aliases: {
              bsonType: "array",
              items: {
                bsonType: "string"
              }
            },
            text: {
              bsonType: "string"
            },
            full_text: {
              bsonType: "string",
              description: "Full chapter text when available"
            },
            synopsis: {
              bsonType: "string",
              description: "Chapter synopsis or summary"
            },
            tags: {
              bsonType: "array",
              items: {
                bsonType: "string"
              }
            },
            locations: {
              bsonType: "array",
              items: {
                oneOf: [
                  { bsonType: "string" },
                  {
                    bsonType: "object",
                    required: ["location"],
                    properties: {
                      location: { bsonType: "string" },
                      significance: { bsonType: "string" }
                    }
                  }
                ]
              }
            },
            events: {
              bsonType: "array",
              items: {
                oneOf: [
                  { bsonType: "string" },
                  {
                    bsonType: "object",
                    required: ["event"],
                    properties: {
                      event: { bsonType: "string" },
                      significance: { bsonType: "string" }
                    }
                  }
                ]
              }
            },
            time_period: {
              bsonType: "string",
              description: "Historical period (e.g., 'late 17th century', 'Restoration period', 'Tudor era')"
            },
            character_arc: {
              bsonType: "string",
              description: "Description of how the character develops through the story"
            },
            key_moments: {
              bsonType: "array",
              items: {
                bsonType: "object",
                required: ["chapter", "description"],
                properties: {
                  chapter: { bsonType: "string" },
                  description: { bsonType: "string" }
                }
              }
            },
            relationships: {
              bsonType: "object",
              patternProperties: {
                ".*": { bsonType: "string" }
              }
            },
            vector_id: {
              bsonType: "string"
            },
            priority: {
              bsonType: "int"
            },
            source_files: {
              bsonType: "array",
              items: {
                bsonType: "string"
              }
            },
            story_arc_position: {
              bsonType: "string"
            },
            chapter_id: {
              bsonType: "string",
              description: "Identifier of the chapter this chunk belongs to"
            },
            chunk_index: {
              bsonType: "int",
              description: "Index of this chunk within the chapter"
            },
            total_chunks: {
              bsonType: "int",
              description: "Total number of chunks in the chapter"
            }
          }
        }
      }
    };
  
  // Check if collection exists
  const collections = await database.listCollections({ name: collectionName }).toArray();
  
  if (collections.length === 0) {
    logger.info(`Creating collection ${collectionName}`);
    await database.createCollection(collectionName, schema);
    logger.info(`Collection ${collectionName} created with schema validation`);
  } else {
    logger.info(`Updating schema for collection ${collectionName}`);
    await database.command({
      collMod: collectionName,
      validator: schema.validator
    });
    logger.info(`Schema updated for collection ${collectionName}`);
  }
  
  // Create text indexes
  await createTextIndexes(projectId);
}

module.exports = {
  connect,
  close,
  getProjectCollection,
  initializeCollection
};