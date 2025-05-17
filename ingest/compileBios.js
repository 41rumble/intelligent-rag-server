const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const { generateStructuredResponse } = require('../src/utils/llmProvider');
require('dotenv').config();

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const bioFragmentsPath = path.join(projectPath, 'raw_bio_fragments');
const compiledBiosPath = path.join(projectPath, 'compiled_bios');

/**
 * Group bio fragments by character name
 * @returns {Promise<Object>} Map of character names to their bio fragments
 */
async function groupBioFragments() {
  const fragments = new Map();
  
  try {
    const files = await fs.readdir(bioFragmentsPath);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(bioFragmentsPath, file);
      const fragment = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      const key = fragment.name.toLowerCase();
      if (!fragments.has(key)) {
        fragments.set(key, new Map()); // Use Map to track fragments by source file
      }
      
      const characterFragments = fragments.get(key);
      // Only add fragment if we don't already have one from this source file
      if (!characterFragments.has(fragment.source_file)) {
        characterFragments.set(fragment.source_file, fragment);
      }
    }
  } catch (error) {
    logger.error('Error grouping bio fragments:', error);
  }
  
  return fragments;
}

/**
 * Compile bio fragments into a complete character bio
 * @param {Array} fragments - Bio fragments for a character
 * @returns {Promise<Object>} Compiled character bio
 */
async function compileBio(fragments) {
  try {
    // Validate fragments
    if (!Array.isArray(fragments)) {
      logger.error('Expected fragments to be an array, got:', typeof fragments);
      return null;
    }

    if (fragments.length === 0) {
      logger.error('No fragments provided');
      return null;
    }

    // Filter out invalid fragments
    const validFragments = fragments.filter(f => {
      if (!f || typeof f !== 'object') {
        logger.warn('Invalid fragment:', f);
        return false;
      }
      if (!f.source_file || !f.name) {
        logger.warn('Fragment missing required fields:', f);
        return false;
      }
      return true;
    });

    if (validFragments.length === 0) {
      logger.error('No valid fragments found');
      return null;
    }
    // Extract chapter number from source file
    function getChapterNumber(sourceFile) {
      const match = sourceFile.match(/\d+/);
      if (!match) {
        logger.warn(`Could not extract chapter number from source file: ${sourceFile}`);
        return Infinity; // Put entries without chapter numbers at the end
      }
      return parseInt(match[0]);
    }

    // Sort fragments by chapter number to maintain chronological order
    const sortedFragments = Array.from(fragments).sort((a, b) => {
      if (!a || !b || !a.source_file || !b.source_file) {
        logger.warn('Invalid fragment found:', { a, b });
        return 0; // Keep invalid fragments in their original position
      }
      return getChapterNumber(a.source_file) - getChapterNumber(b.source_file);
    });

    // Use validFragments instead of original fragments
    const prompt = `
    Analyze these character fragments to build a complete character arc. 
    The fragments are ordered chronologically where possible, showing how the character develops through the story.
    
    Focus on:
    1. Character development and growth
    2. Key turning points in their story
    3. How their role and relationships evolve
    4. Their overall journey through the narrative
    5. Consistent characterization across all fragments

    Bio fragments:
    ${JSON.stringify(validFragments, null, 2)}

    Format your response as a JSON object with:
    - name: Character's full name
    - aliases: Array of all known aliases/nicknames
    - bio: Complete biographical text (300-500 words) that traces their journey through the story
    - character_arc: Brief description of how they change/develop through the story
    - significance: Character's role and importance in the overall narrative
    - key_moments: Array of significant moments/turning points in their story, with chapter references
    - relationships: How their key relationships evolve through the story
    - tags: Array of relevant descriptive tags
    - time_period: Historical period (e.g., "late 17th century", "Restoration period", "Tudor era") - use a descriptive period, not specific dates
    - priority: Importance level (1-3, where 1 is most important)
    `;

    const compiledBio = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 2000
    });

    // Add metadata
    return {
      ...compiledBio,
      source_files: validFragments.map(f => f.source_file),
      generated_date: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error compiling bio:', error);
    return null;
  }
}

/**
 * Save compiled bio
 * @param {Object} bio - Compiled character bio
 */
async function saveBio(bio) {
  if (!bio || !bio.name) return;
  
  try {
    const filename = `${bio.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}.json`;
    await fs.writeFile(
      path.join(compiledBiosPath, filename),
      JSON.stringify(bio, null, 2)
    );
    
    logger.info(`Saved compiled bio: ${filename}`);
  } catch (error) {
    logger.error(`Error saving bio for ${bio.name}:`, error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Ensure compiled bios directory exists
    await fs.mkdir(compiledBiosPath, { recursive: true });
    
    // Group bio fragments by character
    const fragmentGroups = await groupBioFragments();
    logger.info(`Found bio fragments for ${fragmentGroups.size} characters`);
    
    // Compile and save bios
    for (const [name, fragmentMap] of fragmentGroups) {
      const fragments = Array.from(fragmentMap.values());
      logger.info(`Compiling bio for ${name} from ${fragments.length} fragments (${fragmentMap.size} unique chapters)`);
      const compiledBio = await compileBio(fragments);
      await saveBio(compiledBio);
    }
    
    logger.info('All bios compiled successfully');
  } catch (error) {
    logger.error('Error in main process:', error);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  compileBio
};