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
 * Build direct character-to-character relationships
 * @param {Array} bios - Character bios
 * @param {Array} chapters - Chapter data
 */
async function buildCharacterRelationships(bios, chapters) {
  const relationships = [];
  logger.info('Building character relationships...');

  // 1. Extract explicit relationships from bios
  for (const bio of bios) {
    if (bio.relationships) {
      for (const [targetName, description] of Object.entries(bio.relationships)) {
        relationships.push({
          type: "character_relationship",
          source_character: bio.name,
          target_character: targetName,
          relationship_type: inferRelationshipType(description),
          strength: calculateRelationshipStrength(description),
          timeline: await findInteractions(bio.name, targetName, chapters)
        });
      }
    }
  }

  // 2. Analyze co-occurrences in chapters
  const coOccurrences = await analyzeCoOccurrences(bios, chapters);
  relationships.push(...coOccurrences);

  logger.info(`Built ${relationships.length} character relationships`);
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