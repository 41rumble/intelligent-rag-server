const logger = require('../utils/logger');
const { generateCompletion } = require('../utils/llmProvider');

/**
 * Extract named entities from query text
 * @param {string} query - Query text
 * @returns {Promise<Object>} Extracted entities
 */
async function extractEntities(query) {
  const prompt = `
  Extract named entities from this query:
  "${query}"

  Return a JSON object with these arrays:
  - people: Names of people/characters
  - places: Location names
  - events: Named events or incidents
  - chapters: Chapter references (e.g., "chapter 3", "third chapter")

  Only include entities that are explicitly mentioned.
  Return as valid JSON.
  `;

  try {
    const response = await generateCompletion(prompt);
    const entities = JSON.parse(response);
    
    logger.info('Entities extracted:', {
      query,
      entity_counts: {
        people: entities.people?.length || 0,
        places: entities.places?.length || 0,
        events: entities.events?.length || 0,
        chapters: entities.chapters?.length || 0
      }
    });
    
    return entities;
  } catch (error) {
    logger.error('Error extracting entities:', error);
    return {
      people: [],
      places: [],
      events: [],
      chapters: []
    };
  }
}

module.exports = {
  extractEntities
};