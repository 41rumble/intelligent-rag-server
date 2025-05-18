const fs = require('fs').promises;
const path = require('path');
const mongoClient = require('../src/utils/mongoClient');
const vectorStore = require('../src/utils/vectorStore');
const logger = require('../src/utils/logger');
const { generateEmbedding } = require('../src/utils/llmProvider');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const synopsesPath = path.join(projectPath, 'synopses');
const compiledBiosPath = path.join(projectPath, 'compiled_bios');

// Using the generateEmbedding function from llmProvider.js

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
      
      // Generate embedding for synopsis and full text if available
      let embeddingText = `${synopsisData.title}. ${synopsisData.synopsis}`;
      if (synopsisData.full_text) {
        // If full text is available, include first ~1000 chars in embedding
        const previewText = synopsisData.full_text.slice(0, 1000);
        embeddingText = `${synopsisData.title}. ${previewText}. ${synopsisData.synopsis}`;
      }
      const embedding = await generateEmbedding(embeddingText);
      const vectorId = uuidv4();
      
      // Store embedding in FAISS
      await vectorStore.addVectors(projectId, [embedding], [vectorId]);
      
      // Process time period
      let timePeriod = synopsisData.time_period;
      if (typeof timePeriod === 'object' && timePeriod !== null) {
        if (timePeriod.context) {
          timePeriod = timePeriod.context;
        } else if (timePeriod.start && timePeriod.end) {
          timePeriod = `${timePeriod.start}-${timePeriod.end}`;
        }
      } else if (Array.isArray(timePeriod)) {
        timePeriod = timePeriod.join(', ');
      }

      // Process locations into string tags
      const locationTags = synopsisData.locations.map(loc => 
        typeof loc === 'object' ? loc.location : loc
      );

      // Prepare document for MongoDB
      const document = {
        _id: `synopsis_${synopsisData.chapter_id}`,
        type: 'chapter_synopsis',
        project: projectId,
        title: synopsisData.title,
        text: synopsisData.synopsis, // Keep text field for backward compatibility
        synopsis: synopsisData.synopsis,
        full_text: synopsisData.full_text || '',
        events: synopsisData.events || [],
        locations: synopsisData.locations || [],
        time_period: timePeriod,
        historical_context: synopsisData.historical_context || '',
        story_arc_position: synopsisData.story_arc_position || '',
        tags: [
          ...locationTags,
          timePeriod,
          synopsisData.story_arc_position
        ].filter(Boolean).map(String),
        vector_id: vectorId,
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
      const vectorId = uuidv4();
      
      // Store embedding in FAISS
      await vectorStore.addVectors(projectId, [embedding], [vectorId]);
      
      // Validate and transform bio data for MongoDB
      function validateBioForMongo(bio) {
        // Ensure required string fields exist and are strings
        const stringFields = ['name', 'bio', 'character_arc', 'significance', 'time_period'];
        const result = {};

        for (const field of stringFields) {
          let value = bio[field];
          if (typeof value === 'object' && value !== null) {
            // Handle time_period object
            if (field === 'time_period') {
              if (value.context) {
                value = value.context;
              } else if (value.start && value.end) {
                value = `${value.start}-${value.end}`;
              }
            } else {
              value = String(value);
            }
          }
          result[field] = value || '';
        }

        // Process arrays
        result.aliases = (bio.aliases || []).map(String);
        result.tags = (bio.tags || []).map(tag => 
          typeof tag === 'object' ? (tag.name || tag.value || JSON.stringify(tag)) : String(tag)
        );
        result.source_files = (bio.source_files || []).map(String);

        // Process key_moments
        result.key_moments = (bio.key_moments || []).map(moment => {
          if (typeof moment === 'string') {
            return {
              chapter: 'unknown',
              description: moment
            };
          }
          if (typeof moment !== 'object' || !moment) {
            return {
              chapter: 'unknown',
              description: String(moment)
            };
          }
          return {
            chapter: String(moment.chapter || 'unknown'),
            description: String(moment.description || moment.event || moment)
          };
        });

        // Process relationships
        if (typeof bio.relationships === 'string') {
          result.relationships = {
            "General": bio.relationships
          };
        } else if (!bio.relationships || typeof bio.relationships !== 'object') {
          result.relationships = {};
        } else {
          // Convert all values to strings
          result.relationships = Object.fromEntries(
            Object.entries(bio.relationships).map(([k, v]) => [k, String(v)])
          );
        }

        // Process priority
        result.priority = parseInt(bio.priority) || 1;

        return result;
      }

      // Validate and transform bio data
      const validatedBio = validateBioForMongo(bioData);

      // Prepare document for MongoDB
      const document = {
        _id: `bio_${file.replace('.json', '')}`,
        type: 'bio',
        project: projectId,
        name: validatedBio.name,
        aliases: validatedBio.aliases,
        text: validatedBio.bio,
        significance: validatedBio.significance,
        tags: validatedBio.tags,
        time_period: validatedBio.time_period,
        character_arc: validatedBio.character_arc,
        key_moments: validatedBio.key_moments,
        relationships: validatedBio.relationships,
        vector_id: vectorId,
        priority: validatedBio.priority,
        source_files: validatedBio.source_files
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