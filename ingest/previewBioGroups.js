const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const { loadNameMappings, findCharacterGroup, normalizeCharacterName } = require('./utils/bioConsolidator');

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const rawBiosPath = path.join(projectPath, 'raw_bios');
const configPath = path.join(__dirname, 'config', 'name_mappings.json');

/**
 * Format bio summary for display
 * @param {Object} bio - Bio object
 * @returns {string} Formatted summary
 */
function formatBioSummary(bio) {
  const summary = [];
  summary.push(`  Name: ${bio.name}`);
  if (bio.source_files) {
    summary.push(`  Source: ${bio.source_files.join(', ')}`);
  }
  if (bio.bio) {
    // Get first 100 characters of bio as preview
    const bioPreview = bio.bio.substring(0, 100).replace(/\\n/g, ' ') + '...';
    summary.push(`  Preview: ${bioPreview}`);
  }
  return summary.join('\\n');
}

/**
 * Display unmatched characters
 * @param {Array} unmatched - Array of unmatched bios
 */
function displayUnmatched(unmatched) {
  console.log('\\n=== Unmatched Characters ===');
  console.log('These characters were not matched to any mapping:');
  unmatched.forEach(bio => {
    console.log('\\n' + formatBioSummary(bio));
  });
  console.log('\\nTo match these characters:');
  console.log('1. Add them to name_mappings.json under character_groups');
  console.log('2. Include variations and disambiguation rules if needed');
}

/**
 * Display potential conflicts
 * @param {Map} bioGroups - Map of character groups
 * @param {Object} nameMappings - Name mappings configuration
 */
function displayConflicts(bioGroups, nameMappings) {
  console.log('\\n=== Potential Conflicts ===');
  
  for (const [primaryName, bios] of bioGroups.entries()) {
    if (bios.length > 1) {
      const group = nameMappings.character_groups.find(g => g.primary_name === primaryName);
      
      console.log(`\\nGroup: ${primaryName}`);
      console.log('Will merge these bios:');
      bios.forEach((bio, index) => {
        console.log(`\\nBio ${index + 1}:`);
        console.log(formatBioSummary(bio));
      });

      if (group) {
        console.log('\\nUsing rules:');
        console.log('- Variations:', group.variations.join(', '));
        if (group.disambiguation) {
          console.log('- Context clues:', group.disambiguation.context_clues.join(', '));
        }
      }
    }
  }
}

/**
 * Display suggested mappings for unmatched characters
 * @param {Array} unmatched - Array of unmatched bios
 */
function suggestMappings(unmatched) {
  console.log('\\n=== Suggested Mappings ===');
  console.log('Add these to name_mappings.json:');
  
  const suggestions = unmatched.map(bio => ({
    primary_name: bio.name,
    variations: [],  // You'll need to fill these manually
    disambiguation: {
      context_clues: []  // Add context clues based on bio text
    }
  }));

  console.log(JSON.stringify({ character_groups: suggestions }, null, 2));
}

/**
 * Main function to preview bio groupings
 */
async function main() {
  try {
    // Load name mappings
    const nameMappings = await loadNameMappings(configPath);
    if (!nameMappings) {
      throw new Error('Failed to load name mappings configuration');
    }

    // Read all raw bio files
    const bioFiles = await fs.readdir(rawBiosPath);
    const bios = [];
    const bioGroups = new Map();
    const unmatched = [];

    // Load and group all bios
    for (const file of bioFiles) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(rawBiosPath, file);
      const bioData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      bios.push(bioData);

      // Try to match to a character group
      const normalizedName = normalizeCharacterName(bioData.name, nameMappings);
      const characterGroup = findCharacterGroup(normalizedName, nameMappings, bioData.bio);

      if (characterGroup) {
        const primaryName = characterGroup.primary_name;
        if (!bioGroups.has(primaryName)) {
          bioGroups.set(primaryName, []);
        }
        bioGroups.get(primaryName).push(bioData);
      } else {
        unmatched.push(bioData);
      }
    }

    // Display statistics
    console.log('=== Bio Grouping Preview ===');
    console.log(`Total bios found: ${bios.length}`);
    console.log(`Matched groups: ${bioGroups.size}`);
    console.log(`Unmatched characters: ${unmatched.length}`);

    // Display groups and conflicts
    displayConflicts(bioGroups, nameMappings);

    // Display unmatched characters
    displayUnmatched(unmatched);

    // Suggest mappings for unmatched characters
    suggestMappings(unmatched);

    console.log('\\n=== Next Steps ===');
    console.log('1. Review the groups above for accuracy');
    console.log('2. Add missing characters to name_mappings.json');
    console.log('3. Add variations and context clues where needed');
    console.log('4. Run this preview again to verify changes');
    console.log('5. When satisfied, run consolidateBios.js to merge the bios');

  } catch (error) {
    logger.error('Error in bio preview:', error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  formatBioSummary,
  displayUnmatched,
  displayConflicts,
  suggestMappings
};