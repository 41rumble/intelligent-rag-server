const fs = require('fs').promises;
const path = require('path');
const logger = require('../../src/utils/logger');

/**
 * Load and parse name mappings configuration
 * @param {string} configPath - Path to name mappings config file
 * @returns {Object} Parsed name mappings
 */
async function loadNameMappings(configPath) {
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    logger.error('Error loading name mappings:', error);
    return null;
  }
}

/**
 * Find character group for a given name
 * @param {string} name - Character name to look up
 * @param {Object} nameMappings - Name mappings configuration
 * @param {string} bioText - Full bio text for context
 * @returns {Object|null} Matching character group or null
 */
function findCharacterGroup(name, nameMappings, bioText) {
  for (const group of nameMappings.character_groups) {
    // Check primary name
    if (name === group.primary_name) return group;

    // Check variations
    if (group.variations.includes(name)) {
      // If name matches a variation, check context for disambiguation
      const contextMatches = group.disambiguation.context_clues.some(
        clue => bioText.toLowerCase().includes(clue.toLowerCase())
      );
      if (contextMatches) return group;
    }
  }
  return null;
}

/**
 * Normalize a character name
 * @param {string} name - Name to normalize
 * @param {Object} nameMappings - Name mappings configuration
 * @returns {string} Normalized name
 */
function normalizeCharacterName(name, nameMappings) {
  // Remove titles
  let normalized = name;
  for (const title of nameMappings.title_patterns) {
    normalized = normalized.replace(new RegExp(`${title}\\s+`, 'g'), '');
  }
  
  // Remove generation suffixes for comparison
  for (const gen of nameMappings.generation_patterns) {
    normalized = normalized.replace(new RegExp(`\\s+${gen}$`, 'g'), '');
  }
  
  return normalized.trim();
}

/**
 * Merge multiple character bios into one
 * @param {Array} bios - Array of bio objects to merge
 * @param {Object} characterGroup - Character group from mappings
 * @returns {Object} Merged bio
 */
function mergeBios(bios, characterGroup) {
  // Start with the most detailed bio (longest text)
  const baseBio = [...bios].sort((a, b) => b.bio.length - a.bio.length)[0];
  
  // Create merged bio object
  const mergedBio = {
    name: characterGroup.primary_name,
    aliases: new Set([characterGroup.primary_name, ...characterGroup.variations]),
    bio: baseBio.bio,
    significance: baseBio.significance || '',
    time_period: baseBio.time_period || '',
    character_arc: baseBio.character_arc || '',
    key_moments: new Set(),
    relationships: {},
    tags: new Set(),
    source_files: new Set()
  };

  // Add disambiguation info
  if (characterGroup.disambiguation) {
    mergedBio.generation = characterGroup.disambiguation.generation;
    mergedBio.birth_year = characterGroup.disambiguation.birth_year;
  }

  // Merge data from all bios
  for (const bio of bios) {
    // Add unique key moments
    if (bio.key_moments) {
      bio.key_moments.forEach(moment => {
        if (typeof moment === 'string') {
          mergedBio.key_moments.add({ chapter: 'unknown', description: moment });
        } else {
          mergedBio.key_moments.add(moment);
        }
      });
    }

    // Merge relationships
    if (bio.relationships) {
      if (typeof bio.relationships === 'string') {
        mergedBio.relationships['General'] = bio.relationships;
      } else {
        Object.entries(bio.relationships).forEach(([person, rel]) => {
          if (!mergedBio.relationships[person] || 
              mergedBio.relationships[person].length < rel.length) {
            mergedBio.relationships[person] = rel;
          }
        });
      }
    }

    // Add unique tags
    if (bio.tags) {
      bio.tags.forEach(tag => mergedBio.tags.add(tag));
    }

    // Add source files
    if (bio.source_files) {
      bio.source_files.forEach(file => mergedBio.source_files.add(file));
    }
  }

  // Convert Sets back to arrays
  mergedBio.aliases = [...mergedBio.aliases];
  mergedBio.key_moments = [...mergedBio.key_moments];
  mergedBio.tags = [...mergedBio.tags];
  mergedBio.source_files = [...mergedBio.source_files];

  return mergedBio;
}

/**
 * Consolidate character bios using name mappings
 * @param {Array} bios - Array of bio objects
 * @param {Object} nameMappings - Name mappings configuration
 * @returns {Array} Consolidated bios
 */
function consolidateBios(bios, nameMappings) {
  const bioGroups = new Map(); // Map of primary_name to array of bios

  // Group bios by character
  for (const bio of bios) {
    const normalizedName = normalizeCharacterName(bio.name, nameMappings);
    const characterGroup = findCharacterGroup(normalizedName, nameMappings, bio.bio);
    
    if (characterGroup) {
      const primaryName = characterGroup.primary_name;
      if (!bioGroups.has(primaryName)) {
        bioGroups.set(primaryName, []);
      }
      bioGroups.get(primaryName).push(bio);
    } else {
      // For unmatched characters, keep them as is
      bioGroups.set(bio.name, [bio]);
    }
  }

  // Merge bios within each group
  const consolidatedBios = [];
  for (const [primaryName, groupBios] of bioGroups.entries()) {
    const characterGroup = nameMappings.character_groups.find(
      g => g.primary_name === primaryName
    );
    
    if (characterGroup && groupBios.length > 1) {
      consolidatedBios.push(mergeBios(groupBios, characterGroup));
    } else {
      consolidatedBios.push(groupBios[0]);
    }
  }

  return consolidatedBios;
}

module.exports = {
  loadNameMappings,
  consolidateBios,
  findCharacterGroup,
  normalizeCharacterName
};