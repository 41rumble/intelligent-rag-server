const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const { generateCompletion } = require('../src/utils/llmProvider');
const BookMetadata = require('../src/models/bookMetadata');
const mongoClient = require('../src/utils/mongoClient');

/**
 * Extract book metadata from chapter content
 * @param {string} projectId - Project ID
 * @param {string} chapterContent - Content of first chapter
 * @returns {Promise<Object>} Extracted metadata
 */
async function extractMetadataFromContent(projectId, chapterContent) {
  const prompt = `Extract book metadata from the following text. Include title, author (if mentioned), time period, locations, and any major themes mentioned. Format as JSON.

Text:
${chapterContent}

Expected format:
{
  "title": "Book Title",
  "author": "Author Name or null if not found",
  "time_period": {
    "start": "Start date/period",
    "end": "End date/period"
  },
  "locations": [
    {
      "name": "Location name",
      "significance": "Brief description of significance"
    }
  ],
  "themes": [
    {
      "theme": "Theme name",
      "description": "Brief description"
    }
  ]
}`;

  const response = await generateCompletion(prompt);
  let metadata;
  try {
    metadata = JSON.parse(response);
  } catch (error) {
    logger.error('Failed to parse metadata JSON:', error);
    throw new Error('Failed to parse metadata from LLM response');
  }

  return {
    project: projectId,
    ...metadata,
    publication_year: null, // This would need to be added manually or found from other sources
    language: 'en',
    genre: [] // This would need to be added manually
  };
}

/**
 * Store book metadata in MongoDB
 * @param {Object} metadata - Book metadata
 */
async function storeMetadata(metadata) {
  try {
    const collection = await mongoClient.getProjectCollection(metadata.project);
    
    // Check if metadata already exists
    const existing = await collection.findOne({ type: 'book_metadata' });
    if (existing) {
      await collection.updateOne(
        { type: 'book_metadata' },
        { $set: { ...metadata, type: 'book_metadata' } }
      );
      logger.info('Updated existing book metadata');
    } else {
      await collection.insertOne({
        ...metadata,
        type: 'book_metadata'
      });
      logger.info('Stored new book metadata');
    }
  } catch (error) {
    logger.error('Failed to store metadata:', error);
    throw error;
  }
}

/**
 * Main function to extract and store book metadata
 * @param {string} projectId - Project ID
 */
async function extractAndStoreMetadata(projectId) {
  try {
    logger.info(`Extracting metadata for project: ${projectId}`);

    // Read first chapter
    const chapterPath = path.join(__dirname, projectId, 'chapters', 'chapter_01.txt');
    const chapterContent = await fs.readFile(chapterPath, 'utf8');

    // Extract metadata
    const metadata = await extractMetadataFromContent(projectId, chapterContent);
    
    // Store metadata
    await storeMetadata(metadata);
    
    logger.info('Successfully extracted and stored book metadata');
  } catch (error) {
    logger.error('Failed to process book metadata:', error);
    throw error;
  }
}

// If running as script
if (require.main === module) {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('Please provide a project ID');
    process.exit(1);
  }

  extractAndStoreMetadata(projectId)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = {
  extractAndStoreMetadata,
  extractMetadataFromContent,
  storeMetadata
};