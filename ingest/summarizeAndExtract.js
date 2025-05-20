const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const { generateStructuredResponse } = require('../src/utils/llmProvider');
const { extractAndStoreMetadata } = require('./extractBookMetadata');
require('dotenv').config();

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const chaptersPath = path.join(projectPath, 'chapters');
const synopsesPath = path.join(projectPath, 'synopses');
const bioFragmentsPath = path.join(projectPath, 'raw_bio_fragments');

/**
 * Normalize a name for file naming
 * @param {string} name - Character name
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_');
}

/**
 * Extract character information from text
 * @param {string} text - Chapter text
 * @param {string} chapterId - Chapter identifier
 * @returns {Promise<Array>} Array of character bio fragments
 */
async function extractCharacters(text, chapterId) {
  try {
    const prompt = `
    Extract all characters mentioned in the following text. For each character:
    1. Identify their full name and any aliases/nicknames
    2. Extract biographical details mentioned in the text
    3. Note their role or significance in the story
    4. Include any historical context if applicable
    
    Format your response as a JSON object with a "characters" field containing an array where each object has:
    - name: Full name
    - aliases: Array of alternative names/nicknames
    - bio_fragment: Biographical information from this text
    - significance: Their role or importance
    - tags: Array of relevant descriptive tags (e.g., "eyewitness", "victim", "official")
    
    Text:
    ${text.substring(0, 8000)}
    `;

    const response = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 2000
    });

    const characters = response.characters || [];
    
    // Add source information
    return characters.map(char => ({
      ...char,
      source_file: chapterId,
      extracted_date: new Date().toISOString()
    }));
  } catch (error) {
    logger.error(`Error extracting characters from ${chapterId}:`, error);
    return [];
  }
}

/**
 * Generate synopsis for a chapter
 * @param {string} text - Chapter text
 * @param {string} chapterId - Chapter identifier
 * @returns {Promise<Object>} Chapter synopsis
 */
async function generateSynopsis(text, chapterId) {
  try {
    const prompt = `
    Create a detailed synopsis of the following text. Include:
    1. Major events and their significance
    2. Historical facts and context
    3. Key locations mentioned
    4. Time period information
    5. Position in the story arc (beginning, rising action, climax, falling action, resolution)
    
    Format your response as a JSON object with:
    - title: A title for this section
    - synopsis: Detailed summary (300-500 words)
    - events: Array of key events
    - locations: Array of locations mentioned
    - time_period: Specific time period covered
    - historical_context: Relevant historical information
    - story_arc_position: Position in narrative arc
    
    Text:
    ${text.substring(0, 8000)}
    `;

    const synopsis = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 2000
    });
    
    // Add metadata
    return {
      ...synopsis,
      chapter_id: chapterId,
      type: 'chapter_synopsis',
      project: projectId,
      generated_date: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error generating synopsis for ${chapterId}:`, error);
    return null;
  }
}

/**
 * Save character bio fragments
 * @param {Array} characters - Character information
 */
async function saveBioFragments(characters) {
  for (const character of characters) {
    if (!character.name) continue;
    
    const normalizedName = normalizeName(character.name);
    
    // Count existing fragments for this character
    try {
      const files = await fs.readdir(bioFragmentsPath);
      const existingFragments = files.filter(f => 
        f.startsWith(normalizedName) && f.endsWith('.json')
      );
      
      const fragmentNumber = existingFragments.length + 1;
      const filename = `${normalizedName}_${String(fragmentNumber).padStart(2, '0')}.json`;
      
      await fs.writeFile(
        path.join(bioFragmentsPath, filename),
        JSON.stringify(character, null, 2)
      );
      
      logger.info(`Saved bio fragment: ${filename}`);
    } catch (error) {
      logger.error(`Error saving bio fragment for ${character.name}:`, error);
    }
  }
}

/**
 * Save chapter synopsis
 * @param {Object} synopsis - Chapter synopsis
 * @param {string} chapterId - Chapter identifier
 */
async function saveSynopsis(synopsis, chapterId) {
  if (!synopsis) return;
  
  try {
    const filename = `${chapterId}.json`;
    await fs.writeFile(
      path.join(synopsesPath, filename),
      JSON.stringify(synopsis, null, 2)
    );
    
    logger.info(`Saved synopsis: ${filename}`);
  } catch (error) {
    logger.error(`Error saving synopsis for ${chapterId}:`, error);
  }
}

/**
 * Process a single chapter
 * @param {string} chapterId - Chapter identifier
 */
async function processChapter(chapterId) {
  try {
    logger.info(`Processing chapter: ${chapterId}`);
    
    // Read chapter text
    const chapterText = await fs.readFile(
      path.join(chaptersPath, `${chapterId}.txt`),
      'utf8'
    );
    
    // Generate synopsis
    const synopsis = await generateSynopsis(chapterText, chapterId);
    await saveSynopsis(synopsis, chapterId);
    
    // Extract characters
    const characters = await extractCharacters(chapterText, chapterId);
    await saveBioFragments(characters);
    
    logger.info(`Completed processing chapter: ${chapterId}`);
  } catch (error) {
    logger.error(`Error processing chapter ${chapterId}:`, error);
  }
}

/**
 * Main function to process all chapters
 */
async function main() {
  try {
    // Ensure directories exist
    await fs.mkdir(synopsesPath, { recursive: true });
    await fs.mkdir(bioFragmentsPath, { recursive: true });
    
    // Get all chapter files
    const chapterFiles = await fs.readdir(chaptersPath);
    const chapterIds = chapterFiles
      .filter(file => file.endsWith('.txt'))
      .map(file => file.replace('.txt', ''));
    
    logger.info(`Found ${chapterIds.length} chapters to process`);
    
    // Extract and store book metadata first
    await extractAndStoreMetadata(projectId);
    logger.info('Book metadata extracted and stored');

    // Process each chapter
    for (const chapterId of chapterIds) {
      await processChapter(chapterId);
    }
    
    logger.info('All chapters processed successfully');
  } catch (error) {
    logger.error('Error in main process:', error);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  processChapter,
  normalizeName
};