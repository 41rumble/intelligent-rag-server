const logger = require('../../utils/logger');

/**
 * Service for expanding user queries into multiple sub-queries
 * to gather more context and information
 */
class QueryExpander {
  /**
   * Generate context-seeking queries
   * @param {string} originalQuery - The user's original query
   * @returns {string[]} Array of context-related queries
   */
  generateContextQueries(originalQuery) {
    // Extract key entities and concepts
    const entities = this.extractEntities(originalQuery);
    const queries = [];

    // Generate broader context queries
    if (entities.time) {
      queries.push(`What was happening in ${entities.location || 'the region'} during ${entities.time}?`);
    }

    if (entities.location) {
      queries.push(`What was the significance of ${entities.location} in this period?`);
    }

    if (entities.person) {
      queries.push(`What role did ${entities.person} play in these events?`);
    }

    if (entities.event) {
      queries.push(`What led to ${entities.event}?`);
      queries.push(`What were the consequences of ${entities.event}?`);
    }

    // If no specific entities found, generate general context queries
    if (queries.length === 0) {
      queries.push(
        `What is the historical context for ${originalQuery}?`,
        `What were the major events related to ${originalQuery}?`
      );
    }

    return queries;
  }

  /**
   * Generate queries focused on temporal aspects
   * @param {string} originalQuery - The user's original query
   * @returns {string[]} Array of time-related queries
   */
  generateTemporalQueries(originalQuery) {
    const entities = this.extractEntities(originalQuery);
    const queries = [];

    if (entities.time) {
      queries.push(
        `What happened before ${entities.time}?`,
        `What happened after ${entities.time}?`,
        `What was the timeline of events around ${entities.time}?`
      );
    } else {
      // If no specific time mentioned, try to establish temporal context
      queries.push(
        `When did these events take place?`,
        `What was the sequence of events?`
      );
    }

    return queries;
  }

  /**
   * Generate queries about relationships between entities
   * @param {string} originalQuery - The user's original query
   * @returns {string[]} Array of relationship-focused queries
   */
  generateRelationshipQueries(originalQuery) {
    const entities = this.extractEntities(originalQuery);
    const queries = [];

    if (entities.person && entities.location) {
      queries.push(`What was ${entities.person}'s connection to ${entities.location}?`);
    }

    if (entities.person && entities.event) {
      queries.push(`How was ${entities.person} involved in ${entities.event}?`);
    }

    if (entities.location && entities.event) {
      queries.push(`What happened in ${entities.location} during ${entities.event}?`);
    }

    // Add general relationship queries
    if (entities.person) {
      queries.push(`Who were the key people connected to ${entities.person}?`);
    }

    if (entities.location) {
      queries.push(`What other locations were connected to events in ${entities.location}?`);
    }

    return queries;
  }

  /**
   * Extract entities from query text
   * @param {string} query - Query text to analyze
   * @returns {Object} Extracted entities
   */
  extractEntities(query) {
    // This is a simple implementation - we'll enhance this with NLP later
    const entities = {
      person: null,
      location: null,
      time: null,
      event: null
    };

    // Simple pattern matching for now
    // Look for dates
    const datePattern = /\b\d{4}s?\b|\b(?:early|mid|late)?\s*\d{2}(?:th|st|nd|rd)\s*century\b/i;
    const dateMatch = query.match(datePattern);
    if (dateMatch) {
      entities.time = dateMatch[0];
    }

    // Look for locations (this is very basic - we'll improve it)
    const commonLocations = ['Smyrna', 'Constantinople', 'Anatolia', 'Turkey', 'Greece'];
    for (const location of commonLocations) {
      if (query.includes(location)) {
        entities.location = location;
        break;
      }
    }

    // Look for events (basic implementation)
    const commonEvents = ['Armenian Genocide', 'Great Fire', 'evacuation'];
    for (const event of commonEvents) {
      if (query.toLowerCase().includes(event.toLowerCase())) {
        entities.event = event;
        break;
      }
    }

    // Look for people/groups (basic implementation)
    const commonPeople = ['Greeks', 'Turks', 'Armenians', 'refugees'];
    for (const person of commonPeople) {
      if (query.includes(person)) {
        entities.person = person;
        break;
      }
    }

    return entities;
  }

  /**
   * Main method to expand a query
   * @param {string} originalQuery - The user's original query
   * @returns {Object} Expanded queries object
   */
  async expandQuery(originalQuery) {
    logger.debug(`Expanding query: ${originalQuery}`);

    const expanded = {
      original: originalQuery,
      context_queries: this.generateContextQueries(originalQuery),
      temporal_queries: this.generateTemporalQueries(originalQuery),
      relationship_queries: this.generateRelationshipQueries(originalQuery)
    };

    logger.debug('Generated expanded queries:', expanded);
    return expanded;
  }
}

module.exports = QueryExpander;