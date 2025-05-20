const logger = require('../utils/logger');
const { 
  inferRelationshipType,
  calculateRelationshipStrength,
  inferRole,
  calculateInfluence,
  classifyEvent
} = require('./analyzers');
const {
  findInteractions,
  analyzeCoOccurrences,
  groupByTimePeriod,
  identifySocialGroups,
  extractThemes,
  trackThemeDevelopment,
  extractEvents,
  findCharacterInvolvement,
  identifyEventThemes
} = require('./extractors');

/**
 * Build detailed relationship between two characters
 */
async function buildDetailedRelationship(char1Name, char2Name, sharedChapters) {
  logger.info(`Building detailed relationship between ${char1Name} and ${char2Name}`);

  try {
    // Find all interactions between these characters
    const interactions = await findInteractions(char1Name, char2Name, sharedChapters);
    
    if (!interactions || interactions.length === 0) {
      logger.info(`No interactions found between ${char1Name} and ${char2Name}`);
      return null;
    }

    // Analyze co-occurrences for context
    const coOccurrences = await analyzeCoOccurrences(char1Name, char2Name, sharedChapters);
    
    if (!coOccurrences) {
      logger.info(`No co-occurrences found between ${char1Name} and ${char2Name}`);
      return null;
    }

    // Calculate relationship strength
    const strength = calculateRelationshipStrength(interactions, coOccurrences);

    // Determine relationship type
    const type = inferRelationshipType(interactions);

    // Track relationship progression
    const progression = trackProgression(interactions);

    return {
      source_character: char1Name,
      target_character: char2Name,
      strength,
      type,
      key_moments: extractKeyMoments(interactions),
      progression,
      interactions_count: interactions.length,
      co_occurrences: coOccurrences
    };
  } catch (error) {
    logger.error(`Error building relationship between ${char1Name} and ${char2Name}: ${error.message}`);
    throw error;
  }
}

/**
 * Track how relationship changes over time
 */
function trackProgression(interactions) {
  // Sort interactions by chapter
  const sortedInteractions = [...interactions]
    .sort((a, b) => a.chapter.localeCompare(b.chapter));
  
  // Track significant changes
  const significantChanges = [];
  let lastSentiment = 0;
  
  for (const interaction of sortedInteractions) {
    if (Math.abs(interaction.sentiment - lastSentiment) > 0.5) {
      significantChanges.push({
        chapter: interaction.chapter,
        from: lastSentiment,
        to: interaction.sentiment,
        cause: interaction.description
      });
    }
    lastSentiment = interaction.sentiment;
  }
  
  return {
    initial_state: sortedInteractions[0]?.sentiment || 0,
    current_state: sortedInteractions[sortedInteractions.length - 1]?.sentiment || 0,
    significant_changes: significantChanges
  };
}

/**
 * Extract key moments in the relationship
 */
function extractKeyMoments(interactions) {
  return interactions
    .filter(i => Math.abs(i.sentiment) > 0.7) // Only highly emotional interactions
    .map(i => ({
      chapter: i.chapter,
      description: i.description,
      sentiment: i.sentiment,
      type: i.type
    }))
    .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment)) // Most significant first
    .slice(0, 5); // Top 5 key moments
}

/**
 * Build direct character-to-character relationships
 * @param {Array} bios - Character bios
 * @param {Array} chapters - Chapter data
 */
async function buildCharacterRelationships(bios, chapters) {
  const relationships = [];
  logger.info('Building character relationships...');

  // Process each character pair
  for (let i = 0; i < bios.length; i++) {
    for (let j = i + 1; j < bios.length; j++) {
      const char1 = bios[i];
      const char2 = bios[j];
      
      // Skip if they never appear in the same chapters
      const sharedChapters = chapters.filter(ch =>
        ch.text.toLowerCase().includes(char1.name.toLowerCase()) &&
        ch.text.toLowerCase().includes(char2.name.toLowerCase())
      );
      
      if (sharedChapters.length > 0) {
        logger.info(`Analyzing relationship between ${char1.name} and ${char2.name}`);
        
        // Build detailed relationship
        try {
          const relationship = await buildDetailedRelationship(
            char1.name,
            char2.name,
            sharedChapters
          );
          
          // Only process if we found a relationship
          if (relationship) {
            // Add explicit relationship data if it exists
            if (char1.relationships?.[char2.name]) {
              relationship.explicit_description = char1.relationships[char2.name];
            }
            if (char2.relationships?.[char1.name]) {
              relationship.reverse_description = char2.relationships[char1.name];
            }
            
            relationships.push(relationship);
            logger.info(`Successfully added relationship between ${char1.name} and ${char2.name}`);
          }
        } catch (error) {
          logger.error(`Error processing relationship between ${char1.name} and ${char2.name}: ${error.message}`);
          // Continue with next pair instead of breaking the whole process
          continue;
        }
      }
    }
  }

  logger.info(`Built ${relationships.length} character relationships`);
  logger.info('Relationship array structure:', JSON.stringify({
    count: relationships.length,
    first_few: relationships.slice(0, 2)
  }, null, 2));
  return relationships;
}

/**
 * Build social networks and groups
 * @param {Array} bios - Character bios
 * @param {Array} chapters - Chapter data
 */
async function buildSocialNetworks(bios, chapters) {
  const networks = [];
  logger.info('Building social networks...');

  // 1. Group characters by time periods
  const timeGroups = groupByTimePeriod(bios);

  // 2. For each time period, identify social groups
  for (const [period, characters] of Object.entries(timeGroups)) {
    // Find character co-occurrences in this period
    const periodChapters = chapters.filter(ch => 
      characters.some(char => 
        char.source_files.includes(ch.chapter_id)
      )
    );

    // Build social groups based on interactions
    const groups = identifySocialGroups(characters, periodChapters);
    
    // Add each group as a social network
    for (const group of groups) {
      networks.push({
        type: "social_network",
        group_name: group.name,
        time_period: period,
        members: group.members.map(member => ({
          character: member.name,
          role: inferRole(member, group),
          influence: calculateInfluence(member, group)
        }))
      });
    }
  }

  logger.info(`Built ${networks.length} social networks`);
  return networks;
}

/**
 * Build thematic connections between characters
 * @param {Array} bios - Character bios
 * @param {Array} chapters - Chapter data
 */
async function buildThematicConnections(bios, chapters) {
  const connections = [];
  logger.info('Building thematic connections...');

  // 1. Extract themes from bios and chapters
  const themes = extractThemes(bios, chapters);

  // 2. For each theme, track its development through characters
  for (const theme of themes) {
    const characterDevelopment = [];

    // Find characters involved with this theme
    for (const bio of bios) {
      if (bio.tags?.includes(theme) || 
          bio.character_arc?.toLowerCase().includes(theme.toLowerCase())) {
        
        // Track theme development through chapters
        const development = trackThemeDevelopment(bio, theme, chapters);
        
        if (development.length > 0) {
          characterDevelopment.push({
            name: bio.name,
            development
          });
        }
      }
    }

    if (characterDevelopment.length > 0) {
      connections.push({
        type: "thematic_connection",
        theme,
        characters: characterDevelopment
      });
    }
  }

  logger.info(`Built ${connections.length} thematic connections`);
  return connections;
}

/**
 * Build event networks showing character involvement
 * @param {Array} bios - Character bios
 * @param {Array} chapters - Chapter data
 */
async function buildEventNetworks(bios, chapters) {
  const networks = [];
  logger.info('Building event networks...');

  // 1. Extract significant events from chapters
  const events = extractEvents(chapters);

  // 2. For each event, map character involvement
  for (const event of events) {
    // Find characters involved in this event
    const participants = [];
    
    for (const bio of bios) {
      const involvement = findCharacterInvolvement(bio, event, chapters);
      
      if (involvement) {
        participants.push({
          character: bio.name,
          role: involvement.role,
          impact: involvement.impact
        });
      }
    }

    if (participants.length > 0) {
      networks.push({
        type: "event_network",
        event: event.name,
        event_type: classifyEvent(event),
        participants,
        themes: identifyEventThemes(event),
        chapters: event.chapters
      });
    }
  }

  logger.info(`Built ${networks.length} event networks`);
  return networks;
}

module.exports = {
  buildCharacterRelationships,
  buildSocialNetworks,
  buildThematicConnections,
  buildEventNetworks
};