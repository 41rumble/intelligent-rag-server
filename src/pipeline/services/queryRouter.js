const logger = require('../../utils/logger');
const MultiSourceSearch = require('./multiSourceSearch');

/**
 * Service for routing queries to appropriate search strategies
 */
class QueryRouter {
  constructor(projectId) {
    this.projectId = projectId;
    this.searchService = new MultiSourceSearch(projectId);
  }

  /**
   * Build MongoDB query based on classification
   * @param {Object} classification - Query classification
   * @returns {Object} MongoDB query
   */
  buildMongoQuery(classification) {
    // Always start with project-specific context
    const query = { 
      $and: [
        { project: this.projectId },
        // Ensure we're only getting content from this project
        { 
          $or: [
            { project_specific: true },
            { source_project: this.projectId },
            { context_project: this.projectId }
          ]
        }
      ]
    };

    // Add type-specific conditions
    switch (classification.primary_type) {
      case 'character_analysis':
        query.$and.push({
          $or: [
            { type: 'character_bio' },
            { type: 'character_relationship' },
            { 'events.affected_characters.character': { $in: classification.characters.map(c => c.name) } }
          ]
        });
        break;

      case 'relationship_analysis':
        query.$and.push({
          $or: [
            { 
              type: 'character_relationship',
              $and: [
                { 'relationship_data.source_character': { $in: classification.characters.map(c => c.name) } },
                { 'relationship_data.target_character': { $in: classification.characters.map(c => c.name) } }
              ]
            },
            {
              type: 'plot_event',
              'events.affected_characters.character': { 
                $all: classification.character_relationships.flat()
              }
            }
          ]
        });
        break;

      case 'theme_analysis':
        query.$and.push({
          $or: [
            { type: 'theme_analysis' },
            { 'theme_data.themes.theme': { $in: classification.themes } },
            { 'theme_data.symbols.symbol': { $in: classification.symbols } }
          ]
        });
        break;

      case 'plot_analysis':
        query.$and.push({
          $or: [
            { type: 'chapter_synopsis' },
            { type: 'plot_event' },
            { 'events.event_type': 'plot_point' }
          ]
        });
        break;

      case 'setting_analysis':
        query.$and.push({
          $or: [
            { type: 'location_description' },
            { 'locations.location': { $in: classification.locations.map(l => l.name) } }
          ]
        });
        break;
    }

    // Add temporal conditions if specified
    if (classification.temporal_aspects.temporal_scope !== 'full_story') {
      const timeQuery = {};
      switch (classification.temporal_aspects.temporal_scope) {
        case 'scene':
          timeQuery['timeline_data.relative_position'] = { 
            $exists: true,
            $ne: null
          };
          break;
        case 'chapter':
          timeQuery['chapter_data.chapter_number'] = { $exists: true };
          break;
        case 'arc':
          timeQuery['story_arc_position'] = { $exists: true };
          break;
      }
      query.$and.push(timeQuery);
    }

    // Add relationship context if needed
    if (classification.context_needed.includes('relationship_history')) {
      query.$and.push({
        'relationship_data.progression': { $exists: true }
      });
    }

    // Add character development context if needed
    if (classification.context_needed.includes('character_background')) {
      query.$and.push({
        'character_data.character_arc': { $exists: true }
      });
    }

    return query;
  }

  /**
   * Build vector search parameters based on classification
   * @param {Object} classification - Query classification
   * @returns {Object} Search parameters
   */
  buildVectorParams(classification) {
    return {
      // Even at low thinking levels, get enough context
      k: Math.max(
        5, // minimum context
        classification.complexity >= 8 ? 10 : 
        classification.complexity >= 5 ? 7 : 5
      ),
      
      filters: {
        // Always filter by project
        project: this.projectId,
        project_specific: true,
        
        // Add type-specific filters
        type: this.getRelevantTypes(classification),
        
        // Add temporal filters if needed
        ...(classification.temporal_aspects.temporal_scope !== 'full_story' && {
          temporal_scope: classification.temporal_aspects.temporal_scope
        }),
        
        // Add character filters if specified
        ...(classification.characters.length > 0 && {
          characters: classification.characters.map(c => c.name)
        })
      },
      
      rerank_by: {
        // Always prioritize project-specific content
        ...this.getRerankingStrategy(classification),
        field_weights: {
          ...this.getRerankingStrategy(classification).field_weights,
          'project_relevance': 2.0,
          'content_specificity': 1.5
        }
      }
    };
  }

  /**
   * Get relevant document types based on query classification
   * @param {Object} classification - Query classification
   * @returns {Array} Relevant document types
   */
  getRelevantTypes(classification) {
    const typeMap = {
      character_analysis: ['character_bio', 'character_relationship', 'plot_event'],
      relationship_analysis: ['character_relationship', 'plot_event'],
      theme_analysis: ['theme_analysis', 'chapter_synopsis'],
      plot_analysis: ['plot_event', 'chapter_synopsis'],
      setting_analysis: ['location_description', 'chapter_text'],
      timeline: ['plot_event', 'chapter_synopsis'],
      literary_device: ['theme_analysis', 'chapter_text']
    };

    const types = new Set([
      ...(typeMap[classification.primary_type] || []),
      ...classification.secondary_types.flatMap(t => typeMap[t] || [])
    ]);

    return Array.from(types);
  }

  /**
   * Get reranking strategy based on query classification
   * @param {Object} classification - Query classification
   * @returns {Object} Reranking parameters
   */
  getRerankingStrategy(classification) {
    const strategies = {
      character_analysis: {
        field_weights: {
          'character_data.character_arc': 2.0,
          'character_data.personality_traits': 1.5,
          'events.affected_characters': 1.3
        }
      },
      relationship_analysis: {
        field_weights: {
          'relationship_data.dynamics': 2.0,
          'relationship_data.progression': 1.5
        }
      },
      theme_analysis: {
        field_weights: {
          'theme_data.themes': 2.0,
          'theme_data.symbols': 1.5
        }
      },
      plot_analysis: {
        field_weights: {
          'events.impact_level': 1.5,
          'chapter_data.synopsis': 1.3
        }
      }
    };

    return strategies[classification.primary_type] || {};
  }

  /**
   * Route query to appropriate search strategies
   * @param {Object} classification - Query classification
   * @returns {Promise<Object>} Search results
   */
  async routeQuery(classification) {
    logger.info('Routing query:', { 
      type: classification.primary_type,
      complexity: classification.complexity
    });

    const results = {
      primary: [],
      supporting: [],
      context: []
    };

    // Build search parameters
    const mongoQuery = this.buildMongoQuery(classification);
    const vectorParams = this.buildVectorParams(classification);

    // Execute primary search based on query type
    switch (classification.primary_type) {
      case 'relationship_analysis':
        // Get relationship documents first
        results.primary = await this.searchService.dbSearch(mongoQuery);
        // Then get supporting event documents
        results.supporting = await this.searchService.ragSearch(
          classification.original_query,
          vectorParams
        );
        break;

      case 'theme_analysis':
        // Use vector search for thematic connections
        results.primary = await this.searchService.ragSearch(
          classification.original_query,
          vectorParams
        );
        // Get explicit theme documents
        results.supporting = await this.searchService.dbSearch(mongoQuery);
        break;

      case 'character_analysis':
        // Combine character bio and relationship info
        const bioQuery = { ...mongoQuery };
        bioQuery.$and.push({ type: 'character_bio' });
        results.primary = await this.searchService.dbSearch(bioQuery);
        
        // Get character relationships
        const relQuery = { ...mongoQuery };
        relQuery.$and.push({ type: 'character_relationship' });
        results.supporting = await this.searchService.dbSearch(relQuery);
        break;

      default:
        // Default to combined search
        results.primary = await this.searchService.ragSearch(
          classification.original_query,
          vectorParams
        );
        results.supporting = await this.searchService.dbSearch(mongoQuery);
    }

    // Get additional context if needed
    if (classification.context_needed.length > 0) {
      for (const contextType of classification.context_needed) {
        const contextQuery = this.buildContextQuery(contextType, classification);
        const contextResults = await this.searchService.dbSearch(contextQuery);
        results.context.push(...contextResults);
      }
    }

    // Add web results for high complexity queries
    if (classification.complexity >= 7) {
      const webResults = await this.searchService.webSearch(
        classification.original_query,
        {
          projectId: this.projectId,
          focus: classification.primary_type
        }
      );
      results.context.push(...webResults);
    }

    return results;
  }

  /**
   * Build query for fetching additional context
   * @param {string} contextType - Type of context needed
   * @param {Object} classification - Query classification
   * @returns {Object} MongoDB query
   */
  buildContextQuery(contextType, classification) {
    const contextQueries = {
      character_background: {
        type: 'character_bio',
        'character_data.character_arc': { $exists: true }
      },
      prior_events: {
        type: 'plot_event',
        'timeline_data.relative_position': { $lt: classification.temporal_aspects.time_focus }
      },
      future_impact: {
        type: 'plot_event',
        'timeline_data.relative_position': { $gt: classification.temporal_aspects.time_focus }
      },
      thematic_context: {
        type: 'theme_analysis',
        'theme_data.themes.theme': { $in: classification.themes }
      },
      relationship_history: {
        type: 'character_relationship',
        'relationship_data.progression': { $exists: true }
      },
      setting_details: {
        type: 'location_description',
        'locations.location': { $in: classification.locations.map(l => l.name) }
      }
    };

    return {
      $and: [
        { project: this.projectId },
        contextQueries[contextType] || {}
      ]
    };
  }
}

module.exports = QueryRouter;