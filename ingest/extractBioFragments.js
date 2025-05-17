const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const { generateStructuredResponse } = require('../src/utils/llmProvider');
require('dotenv').config();

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const chaptersPath = path.join(projectPath, 'chapters');
const bioFragmentsPath = path.join(projectPath, 'raw_bio_fragments');

/**
 * Extract character bio fragments from a chapter
 * @param {string} chapterId - Chapter identifier
 * @param {string} chapterText - Chapter content
 * @returns {Promise<Array>} Array of bio fragments
 */
async function extractBioFragments(chapterId, chapterText) {
  try {
    const prompt = `
    Extract biographical information about characters mentioned in this chapter.
    Focus on significant characters and their actions, relationships, and development.
    Include both explicit details and implicit characterization.

    Chapter text:
    ${chapterText}

    For each character found, format the response as a JSON object with:
    - name: Character's full name
    - aliases: Array of names/titles used in this chapter
    - description: What we learn about them in this chapter (2-3 sentences)
    - significance: Their role/importance in this chapter
    - relationships: Key relationships revealed
    - development: How they change or what we learn about them
    - source_file: "${chapterId}"

    Return an array of these character objects, focusing on the most significant characters.
    `;

    const bioFragments = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 2000
    });

    return Array.isArray(bioFragments) ? bioFragments : [];
  } catch (error) {
    logger.error(`Error extracting bio fragments from ${chapterId}:`, error);
    return [];
  }
}

/**
 * Save bio fragment
 * @param {Object} fragment - Character bio fragment
 */
async function saveFragment(fragment) {
  if (!fragment || !fragment.name) return;
  
  try {
    const filename = `${fragment.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}_${fragment.source_file}.json`;
    await fs.writeFile(
      path.join(bioFragmentsPath, filename),
      JSON.stringify(fragment, null, 2)
    );
    
    logger.info(`Saved bio fragment: ${filename}`);
  } catch (error) {
    logger.error(`Error saving fragment for ${fragment.name}:`, error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Ensure bio fragments directory exists
    await fs.mkdir(bioFragmentsPath, { recursive: true });
    
    // Get all chapter files
    const chapterFiles = await fs.readdir(chaptersPath);
    logger.info(`Found ${chapterFiles.length} chapters to process`);
    
    // Process each chapter
    for (const file of chapterFiles) {
      if (!file.endsWith('.txt')) continue;
      
      const chapterId = file.replace('.txt', '');
      const filePath = path.join(chaptersPath, file);
      const chapterText = await fs.readFile(filePath, 'utf8');
      
      logger.info(`Processing chapter: ${chapterId}`);
      const fragments = await extractBioFragments(chapterId, chapterText);
      
      // Save each fragment
      for (const fragment of fragments) {
        await saveFragment(fragment);
      }
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
  extractBioFragments
};