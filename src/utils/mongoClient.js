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
    client = new MongoClient(uri);
    await client.connect();
    logger.info('Connected to MongoDB');
    
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

/**
 * Create vector index for a collection if it doesn't exist
 * @param {string} projectId - Project identifier
 */
async function createVectorIndex(projectId) {
  const database = await connect();
  const collection = database.collection(`project_${projectId}`);
  
  // Check if index exists
  const indexes = await collection.listIndexes().toArray();
  const vectorIndexExists = indexes.some(index => index.name === 'vector_index');
  
  if (!vectorIndexExists) {
    logger.info(`Creating vector index for project_${projectId}`);
    await collection.createIndex(
      { embedding: "vector" },
      { 
        name: "vector_index",
        dimensions: 1536, // Adjust based on your embedding model
        numBuckets: 16
      }
    );
    logger.info(`Vector index created for project_${projectId}`);
  }
}

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
        tags: "text"
      },
      { 
        name: "text_search_index",
        weights: {
          text: 1,
          name: 10,
          tags: 5
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
  
  // Check if collection exists
  const collections = await database.listCollections({ name: collectionName }).toArray();
  
  if (collections.length === 0) {
    logger.info(`Creating collection ${collectionName}`);
    
    await database.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["type", "project", "text"],
          properties: {
            type: {
              bsonType: "string",
              enum: ["chapter_synopsis", "bio", "acknowledgement", "preface"]
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
            tags: {
              bsonType: "array",
              items: {
                bsonType: "string"
              }
            },
            time_period: {
              bsonType: "string"
            },
            embedding: {
              bsonType: "array"
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
            }
          }
        }
      }
    });
    
    logger.info(`Collection ${collectionName} created with schema validation`);
  }
  
  // Create indexes
  await createVectorIndex(projectId);
  await createTextIndexes(projectId);
}

module.exports = {
  connect,
  close,
  getProjectCollection,
  initializeCollection
};