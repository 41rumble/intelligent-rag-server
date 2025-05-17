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
        fragments.set(key, []);
      }
      fragments.get(key).push(fragment);
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
    const prompt = `
    Compile a complete character biography from these fragments. Resolve any conflicts
    and create a coherent narrative. Include all relevant details about the character's
    role, significance, and historical context.

    Bio fragments:
    ${JSON.stringify(fragments, null, 2)}

    Format your response as a JSON object with:
    - name: Character's full name
    - aliases: Array of all known aliases/nicknames
    - bio: Complete biographical text (300-500 words)
    - significance: Character's role and importance
    - tags: Array of relevant descriptive tags
    - time_period: Time period(s) the character is associated with
    - priority: Importance level (1-3, where 1 is most important)
    `;

    const compiledBio = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 2000
    });

    // Add metadata
    return {
      ...compiledBio,
      source_files: fragments.map(f => f.source_file),
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
    for (const [name, fragments] of fragmentGroups) {
      logger.info(`Compiling bio for ${name} from ${fragments.length} fragments`);
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