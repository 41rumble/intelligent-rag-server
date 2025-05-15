const fs = require('fs').promises;
const path = require('path');
const { OpenAI } = require('openai');
const mongoClient = require('../src/utils/mongoClient');
const logger = require('../src/utils/logger');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const synopsesPath = path.join(projectPath, 'synopses');
const compiledBiosPath = path.join(projectPath, 'compiled_bios');

/**
 * Generate embeddings for text
 * @param {string} text - Text to embed
 * @returns {Promise<Array>} Embedding vector
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL,
      input: text,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    logger.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Process and store chapter synopses
 * @returns {Promise<void>}
 */
async function processSynopses() {
  try {
    const collection = await mongoClient.getProjectCollection(projectId);
    
    // Get all synopsis files
    const synopsisFiles = await fs.readdir(synopsesPath);
    logger.info(`Found ${synopsisFiles.length} synopses to process`);
    
    for (const file of synopsisFiles) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(synopsesPath, file);
      const synopsisData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      // Generate embedding for synopsis text
      const embeddingText = `${synopsisData.title}. ${synopsisData.synopsis}`;
      const embedding = await generateEmbedding(embeddingText);
      
      // Prepare document for MongoDB
      const document = {
        _id: `synopsis_${synopsisData.chapter_id}`,
        type: 'chapter_synopsis',
        project: projectId,
        title: synopsisData.title,
        text: synopsisData.synopsis,
        events: synopsisData.events,
        locations: synopsisData.locations,
        time_period: synopsisData.time_period,
        historical_context: synopsisData.historical_context,
        story_arc_position: synopsisData.story_arc_position,
        tags: [
          ...synopsisData.locations,
          synopsisData.time_period,
          synopsisData.story_arc_position
        ].filter(Boolean),
        embedding: embedding,
        priority: 2,
        source_files: [synopsisData.chapter_id]
      };
      
      // Insert or update document
      await collection.updateOne(
        { _id: document._id },
        { $set: document },
        { upsert: true }
      );
      
      logger.info(`Processed synopsis: ${file}`);
    }
    
    logger.info('All synopses processed successfully');
  } catch (error) {
    logger.error('Error processing synopses:', error);
  }
}

/**
 * Process and store character bios
 * @returns {Promise<void>}
 */
async function processBios() {
  try {
    const collection = await mongoClient.getProjectCollection(projectId);
    
    // Get all bio files
    const bioFiles = await fs.readdir(compiledBiosPath);
    logger.info(`Found ${bioFiles.length} bios to process`);
    
    for (const file of bioFiles) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(compiledBiosPath, file);
      const bioData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      // Generate embedding for bio text
      const embeddingText = `${bioData.name}. ${bioData.bio}`;
      const embedding = await generateEmbedding(embeddingText);
      
      // Prepare document for MongoDB
      const document = {
        _id: `bio_${file.replace('.json', '')}`,
        type: 'bio',
        project: projectId,
        name: bioData.name,
        aliases: bioData.aliases || [],
        text: bioData.bio,
        significance: bioData.significance,
        tags: bioData.tags || [],
        time_period: bioData.time_period,
        embedding: embedding,
        priority: bioData.priority || 1,
        source_files: bioData.source_files || []
      };
      
      // Insert or update document
      await collection.updateOne(
        { _id: document._id },
        { $set: document },
        { upsert: true }
      );
      
      logger.info(`Processed bio: ${file}`);
    }
    
    logger.info('All bios processed successfully');
  } catch (error) {
    logger.error('Error processing bios:', error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Initialize MongoDB collection with schema validation
    await mongoClient.initializeCollection(projectId);
    
    // Process synopses and bios
    await processSynopses();
    await processBios();
    
    logger.info('All documents processed and stored successfully');
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
  generateEmbedding
};