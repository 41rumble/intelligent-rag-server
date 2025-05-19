const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const { uploadDocuments, closeDB } = require('../src/utils/dbProvider');
require('dotenv').config();

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';
const shouldUpload = process.argv.includes('--upload');

// Paths
const projectPath = path.join(__dirname, projectId);
const chaptersPath = path.join(projectPath, 'chapters');
const chapterDataPath = path.join(projectPath, 'chapter_data');

/**
 * Split text into chunks with overlap
 * @param {string} text - Full text to chunk
 * @param {number} chunkSize - Target size of each chunk
 * @param {number} overlap - Number of words to overlap between chunks
 * @returns {Array<string>} Array of text chunks
 */
function chunkText(text, chunkSize = 2000, overlap = 150) {
  // Split into words while preserving some punctuation
  const words = text.split(/\s+/);
  const chunks = [];
  let i = 0;

  while (i < words.length) {
    // Calculate end of this chunk
    const end = Math.min(i + chunkSize, words.length);
    
    // Create chunk from words
    const chunk = words.slice(i, end).join(' ');
    chunks.push(chunk);
    
    // Move to next chunk position, accounting for overlap
    i += (chunkSize - overlap);
  }

  return chunks;
}

/**
 * Extract chapter metadata from text
 * @param {string} text - Chapter text
 * @param {string} chapterId - Chapter identifier
 * @returns {Object} Chapter metadata
 */
function extractChapterMetadata(text, chapterId) {
  // Basic metadata
  const metadata = {
    chapter_id: chapterId,
    type: 'chapter_text',
    project: projectId,
    word_count: text.split(/\s+/).length,
    processed_date: new Date().toISOString()
  };

  // Try to extract chapter number
  const chapterMatch = chapterId.match(/chapter[_\s-]*(\d+)|[_\s-](\d+)(?:\.|$)/i);
  if (chapterMatch) {
    metadata.chapter_number = parseInt(chapterMatch[1] || chapterMatch[2]);
  }

  // Check for special sections
  const specialSections = {
    'acknowledgements': -2,
    'foreword': -1,
    'preface': 0,
    'afterword': 9998,
    'epilogue': 9999,
    'appendix': 10000
  };

  const lowerChapterId = chapterId.toLowerCase();
  for (const [section, order] of Object.entries(specialSections)) {
    if (lowerChapterId.includes(section)) {
      metadata.section_type = section;
      metadata.section_order = order;
      break;
    }
  }

  // If no special section was found and no chapter number, set defaults
  if (!metadata.section_type && !metadata.chapter_number) {
    metadata.section_type = 'chapter';
    metadata.section_order = 1000; // Middle value for unidentified sections
  }

  return metadata;
}

/**
 * Process and save chapter text chunks
 * @param {string} chapterId - Chapter identifier
 */
async function processChapterText(chapterId) {
  try {
    logger.info(`Processing chapter text: ${chapterId}`);
    
    // Read chapter text
    const chapterText = await fs.readFile(
      path.join(chaptersPath, `${chapterId}.txt`),
      'utf8'
    );
    
    // Extract metadata
    const metadata = extractChapterMetadata(chapterText, chapterId);
    
    // Split into chunks
    const chunks = chunkText(chapterText);
    
    // Prepare chunk documents
    const chunkDocs = chunks.map((text, index) => ({
      ...metadata,
      text: text,
      chunk_index: index,
      total_chunks: chunks.length
    }));
    
    // Save chunks
    const outputFilename = `${chapterId}_chunks.json`;
    await fs.mkdir(chapterDataPath, { recursive: true });
    await fs.writeFile(
      path.join(chapterDataPath, outputFilename),
      JSON.stringify({
        metadata: metadata,
        chunks: chunkDocs
      }, null, 2)
    );
    
    logger.info(`Saved ${chunks.length} chunks for ${chapterId}`);

    // Upload to database if requested
    if (shouldUpload) {
      try {
        await uploadDocuments(chunkDocs, 'chapter_chunks');
        logger.info(`Uploaded ${chunks.length} chunks to database for ${chapterId}`);
      } catch (error) {
        logger.error(`Error uploading chunks for ${chapterId}:`, error);
      }
    }

    return chunkDocs;
  } catch (error) {
    logger.error(`Error processing chapter ${chapterId}:`, error);
    return [];
  }
}

/**
 * Main function to process all chapters
 */
async function main() {
  try {
    // Get all chapter files
    const chapterFiles = await fs.readdir(chaptersPath);
    const chapterIds = chapterFiles
      .filter(file => file.endsWith('.txt'))
      .map(file => file.replace('.txt', ''));
    
    logger.info(`Found ${chapterIds.length} chapters to process`);
    
    // Process each chapter
    for (const chapterId of chapterIds) {
      await processChapterText(chapterId);
    }
    
    logger.info('All chapters processed successfully');
  } catch (error) {
    logger.error('Error in main process:', error);
  } finally {
    if (shouldUpload) {
      await closeDB();
    }
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  processChapterText,
  chunkText,
  extractChapterMetadata
};