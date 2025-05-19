const { MongoClient } = require('mongodb');
const logger = require('./logger');
const { generateEmbedding } = require('./llmProvider');
require('dotenv').config();

let client = null;
let db = null;

/**
 * Initialize database connection
 * @returns {Promise<void>}
 */
async function initDB() {
  if (!client) {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'intelligent_rag');
    logger.info('Database connection initialized');
  }
}

/**
 * Get embeddings model
 * @returns {OpenAIEmbeddings} Embeddings model
 */
function getEmbeddingsModel() {
  return new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'text-embedding-3-small',
    batchSize: 100,
    maxRetries: 3
  });
}

/**
 * Generate embeddings for text using Ollama
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embeddings vector
 */
async function generateEmbeddings(text) {
  try {
    const result = await generateEmbedding(text);
    return result;
  } catch (error) {
    logger.error('Error generating embeddings:', error);
    throw error;
  }
}

/**
 * Upload documents to database with embeddings
 * @param {Array} documents - Array of documents to upload
 * @param {string} collectionName - Name of collection to upload to
 * @returns {Promise<void>}
 */
async function uploadDocuments(documents, collectionName = 'documents') {
  try {
    await initDB();
    const collection = db.collection(collectionName);

    // Process in batches of 20 for efficiency
    const batchSize = 20;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      // Generate embeddings for each document in batch
      const docsWithEmbeddings = await Promise.all(
        batch.map(async (doc) => ({
          ...doc,
          embedding: await generateEmbeddings(doc.text)
        }))
      );

      // Upload batch
      await collection.insertMany(docsWithEmbeddings);
      
      logger.info(`Uploaded batch ${i/batchSize + 1} of ${Math.ceil(documents.length/batchSize)}`);
    }

    // Create indexes if they don't exist
    await collection.createIndex({ embedding: "hnsw" });
    await collection.createIndex({ project: 1 });
    await collection.createIndex({ type: 1 });
    await collection.createIndex({ chapter_id: 1 });
    
    logger.info(`Successfully uploaded ${documents.length} documents to ${collectionName}`);
  } catch (error) {
    logger.error('Error uploading documents:', error);
    throw error;
  }
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('Database connection closed');
  }
}

module.exports = {
  initDB,
  generateEmbeddings,
  uploadDocuments,
  closeDB
};