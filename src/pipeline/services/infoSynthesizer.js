const logger = require('../../utils/logger');
const { generateStructuredResponse } = require('../../utils/llmProvider');

/**
 * Service for synthesizing information from multiple sources
 */
class InfoSynthesizer {
  /**
   * Extract key points from search results
   * @param {Object} searchResults - Results from multiple sources
   * @returns {Array} Array of key points
   */
  extractKeyPoints(searchResults) {
    const points = new Set();

    // Process RAG results
    for (const result of searchResults.rag) {
      if (result.metadata.events) {
        result.metadata.events.forEach(event => {
          if (typeof event === 'string') {
            points.add(event);
          } else {
            points.add(event.event);
          }
        });
      }
    }

    // Process DB results
    for (const result of searchResults.db) {
      if (result.metadata.events) {
        result.metadata.events.forEach(event => {
          if (typeof event === 'string') {
            points.add(event);
          } else {
            points.add(event.event);
          }
        });
      }
    }

    // Process web results
    for (const result of searchResults.web) {
      if (result.metadata.keyPoints) {
        result.metadata.keyPoints.forEach(point => points.add(point));
      }
    }

    return Array.from(points);
  }

  /**
   * Build a timeline from search results
   * @param {Object} searchResults - Results from multiple sources
   * @returns {Array} Array of timeline events
   */
  buildTimeline(searchResults) {
    const timelineEvents = new Map(); // Use Map to deduplicate by date

    // Helper function to add event to timeline
    const addEvent = (date, event, source) => {
      if (!timelineEvents.has(date)) {
        timelineEvents.set(date, {
          date,
          events: new Set(),
          sources: new Set()
        });
      }
      const entry = timelineEvents.get(date);
      entry.events.add(event);
      entry.sources.add(source);
    };

    // Process all sources
    for (const result of [...searchResults.rag, ...searchResults.db]) {
      if (result.metadata.events) {
        result.metadata.events.forEach(event => {
          const eventText = typeof event === 'string' ? event : event.event;
          // Try to extract date from event text or metadata
          const date = this.extractDate(eventText) || result.metadata.time_period;
          if (date) {
            addEvent(date, eventText, result.source);
          }
        });
      }
    }

    // Convert Map to sorted array
    return Array.from(timelineEvents.values())
      .map(entry => ({
        date: entry.date,
        events: Array.from(entry.events),
        sources: Array.from(entry.sources)
      }))
      .sort((a, b) => this.compareDates(a.date, b.date));
  }

  /**
   * Map relationships between entities
   * @param {Object} searchResults - Results from multiple sources
   * @returns {Object} Relationship map
   */
  mapRelationships(searchResults) {
    const relationships = new Map();

    // Helper function to add relationship
    const addRelationship = (entity1, entity2, description, source) => {
      const key = [entity1, entity2].sort().join('::');
      if (!relationships.has(key)) {
        relationships.set(key, {
          entities: [entity1, entity2],
          descriptions: new Set(),
          sources: new Set()
        });
      }
      const rel = relationships.get(key);
      rel.descriptions.add(description);
      rel.sources.add(source);
    };

    // Process RAG and DB results
    for (const result of [...searchResults.rag, ...searchResults.db]) {
      if (result.metadata.relationships) {
        Object.entries(result.metadata.relationships).forEach(([entity, description]) => {
          addRelationship(
            result.metadata.title,
            entity,
            description,
            result.source
          );
        });
      }
    }

    // Convert Map to array
    return Array.from(relationships.values()).map(rel => ({
      entities: rel.entities,
      descriptions: Array.from(rel.descriptions),
      sources: Array.from(rel.sources)
    }));
  }

  /**
   * Helper function to extract date from text
   * @param {string} text - Text to extract date from
   * @returns {string|null} Extracted date or null
   */
  extractDate(text) {
    // This is a simple implementation - we'll enhance it later
    const datePattern = /\b\d{4}s?\b|\b(?:early|mid|late)?\s*\d{2}(?:th|st|nd|rd)\s*century\b/i;
    const match = text.match(datePattern);
    return match ? match[0] : null;
  }

  /**
   * Helper function to compare dates for sorting
   * @param {string} date1 - First date
   * @param {string} date2 - Second date
   * @returns {number} Comparison result
   */
  compareDates(date1, date2) {
    // This is a simple implementation - we'll enhance it later
    // Convert dates to comparable numbers
    const getValue = (date) => {
      const year = date.match(/\d+/);
      return year ? parseInt(year[0]) : 0;
    };
    return getValue(date1) - getValue(date2);
  }

  /**
   * Generate a structured summary using LLM
   * @param {Object} synthesizedInfo - Synthesized information
   * @returns {Promise<Object>} Structured summary
   */
  async generateSummary(synthesizedInfo) {
    const prompt = `
    Analyze this information and create a structured summary:

    Key Points:
    ${synthesizedInfo.keyPoints.join('\n')}

    Timeline:
    ${synthesizedInfo.timeline.map(t => 
      `${t.date}: ${t.events.join(', ')}`
    ).join('\n')}

    Relationships:
    ${synthesizedInfo.relationships.map(r =>
      `${r.entities.join(' & ')}: ${r.descriptions.join('; ')}`
    ).join('\n')}

    Format your response as a JSON object with:
    - summary: Brief overview of the main points
    - key_findings: Array of important discoveries
    - implications: What these events mean in broader context
    - confidence: Number between 0-1 indicating confidence in conclusions
    `;

    return await generateStructuredResponse(prompt, {
      temperature: 0.3
    });
  }

  /**
   * Main method to synthesize information
   * @param {Object} searchResults - Results from multiple sources
   * @param {number} level - Thinking depth level (1-4)
   * @returns {Promise<Object>} Synthesized information
   */
  async synthesize(searchResults, level = 1) {
    logger.debug(`Synthesizing information at level ${level}`);

    // Basic synthesis for all levels
    const synthesized = {
      keyPoints: this.extractKeyPoints(searchResults),
      timeline: this.buildTimeline(searchResults),
      relationships: this.mapRelationships(searchResults)
    };

    // Enhanced synthesis for higher levels
    if (level >= 3) {
      synthesized.summary = await this.generateSummary(synthesized);
    }

    // Additional processing for level 4
    if (level >= 4) {
      // Here we could add:
      // - Cross-validation of facts
      // - Deeper relationship analysis
      // - More complex timeline construction
      // - Confidence scoring
    }

    return synthesized;
  }
}

module.exports = InfoSynthesizer;