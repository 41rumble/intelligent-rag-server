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
    // Extract sort order from source file
    function getSortOrder(sourceFile) {
      // Define order for special sections
      const specialSections = {
        'acknowledgements': -2,
        'foreword': -1,
        'preface': 0,
        'afterword': Infinity - 2,
        'epilogue': Infinity - 1,
        'appendix': Infinity
      };

      // Check for special sections first
      const lowerSource = sourceFile.toLowerCase();
      for (const [section, order] of Object.entries(specialSections)) {
        if (lowerSource.includes(section)) {
          return order;
        }
      }

      // Try to extract chapter number
      const match = sourceFile.match(/chapter[_\s-]*(\d+)|[_\s-](\d+)(?:\.|$)/i);
      if (match) {
        // match[1] is from first group, match[2] from second group
        const num = parseInt(match[1] || match[2]);
        return num * 10; // Multiply by 10 to leave room for potential sub-chapters
      }

      logger.debug(`Using default sort order for source file: ${sourceFile}`);
      return 1000; // Middle value for unidentified sections
    }

    // Sort fragments by chapter/section order
    const sortedFragments = Array.from(fragments).sort((a, b) => {
      if (!a || !b || !a.source_file || !b.source_file) {
        logger.warn('Invalid fragment found:', { a, b });
        return 0; // Keep invalid fragments in their original position
      }

      const orderA = getSortOrder(a.source_file);
      const orderB = getSortOrder(b.source_file);

      // Log sorting decisions for debugging
      logger.debug(`Sorting ${a.source_file} (${orderA}) vs ${b.source_file} (${orderB})`);

      return orderA - orderB;
    });

    // Use validFragments instead of original fragments
    const prompt = `
    Analyze these character fragments to build a complete character arc. 
    The fragments are ordered in a logical sequence, including both chapter content and special sections like acknowledgments, forewords, and afterwords.
    
    Focus on:
    1. Character development and growth through the main narrative
    2. Key turning points in their story
    3. How their role and relationships evolve
    4. Their overall journey through the narrative
    5. Consistent characterization across all fragments
    6. Additional context from supplementary sections (acknowledgments, forewords, etc.)

    Bio fragments:
    ${JSON.stringify(validFragments, null, 2)}

    Format your response as a JSON object with:
    - name: Character's full name
    - aliases: Array of all known aliases/nicknames
    - bio: Complete biographical text (300-500 words) that traces their journey through the story
    - character_arc: Brief description of how they change/develop through the story
    - significance: Character's role and importance in the overall narrative
    - key_moments: Array of objects, each containing:
        - chapter: The chapter reference (e.g., "chapter_1", "foreword")
        - description: Description of the significant moment/turning point
    - relationships: Object mapping character names to relationship descriptions, e.g.:
        {
          "Character Name": "Description of relationship and how it evolves",
          "Another Character": "Description of another relationship"
        }
    - tags: Array of relevant descriptive tags
    - time_period: Historical period (e.g., "late 17th century", "Restoration period", "Tudor era") - use a descriptive period, not specific dates
    - priority: Importance level (1-3, where 1 is most important)

    CRITICAL: The response must match this exact format. In particular:
    1. key_moments must be an array of objects with both "chapter" and "description" fields
    2. relationships must be an object with character names as keys and descriptions as values
    3. All arrays (aliases, tags, key_moments) must not be empty - use empty arrays [] if none exist
    4. All string fields must not be null - use empty string "" if none exists
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
/**
 * Validate and fix bio data structure
 * @param {Object} bio - Bio data to validate
 * @returns {Object} Validated and fixed bio data
 */
function validateBio(bio) {
  if (!bio || typeof bio !== 'object') {
    throw new Error('Bio must be an object');
  }

  // Ensure required string fields exist and are strings
  const stringFields = ['name', 'bio', 'character_arc', 'significance', 'time_period'];
  for (const field of stringFields) {
    if (!bio[field]) {
      logger.warn(`Missing ${field} in bio for ${bio.name}, setting to empty string`);
      bio[field] = '';
    } else if (typeof bio[field] !== 'string') {
      logger.warn(`Converting ${field} to string in bio for ${bio.name}`);
      bio[field] = String(bio[field]);
    }
  }

  // Ensure arrays exist and contain correct types
  const arrayFields = ['aliases', 'tags', 'key_moments', 'source_files'];
  for (const field of arrayFields) {
    if (!Array.isArray(bio[field])) {
      logger.warn(`${field} is not an array in bio for ${bio.name}, setting to empty array`);
      bio[field] = [];
    }
  }

  // Validate key_moments structure
  bio.key_moments = bio.key_moments.map(moment => {
    if (typeof moment === 'string') {
      // Convert string moments to proper structure
      return {
        chapter: 'unknown',
        description: moment
      };
    }
    if (!moment.chapter || !moment.description) {
      logger.warn(`Invalid key_moment structure in bio for ${bio.name}, fixing`);
      return {
        chapter: moment.chapter || 'unknown',
        description: moment.description || String(moment)
      };
    }
    return moment;
  });

  // Validate relationships
  if (typeof bio.relationships === 'string') {
    // Convert string relationships to object
    logger.warn(`Converting relationships string to object in bio for ${bio.name}`);
    bio.relationships = {
      "General": bio.relationships
    };
  } else if (!bio.relationships || typeof bio.relationships !== 'object') {
    logger.warn(`Invalid relationships in bio for ${bio.name}, setting to empty object`);
    bio.relationships = {};
  }

  // Ensure priority is a number
  if (typeof bio.priority !== 'number') {
    bio.priority = parseInt(bio.priority) || 1;
  }

  return bio;
}

async function saveBio(bio) {
  if (!bio || !bio.name) return;
  
  try {
    // Validate and fix bio structure
    const validatedBio = validateBio(bio);
    
    const filename = `${validatedBio.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_')}.json`;
    await fs.writeFile(
      path.join(compiledBiosPath, filename),
      JSON.stringify(validatedBio, null, 2)
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