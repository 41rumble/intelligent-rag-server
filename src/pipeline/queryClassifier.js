const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
require('dotenv').config();

/**
 * Classify a query to extract entities and query type
 * @param {string} query - User query
 * @param {string} projectId - Project identifier
 * @returns {Promise<Object>} Classification result
 */
async function classifyQuery(query, projectId) {
  try {
    const prompt = `
    Analyze this literary query and extract detailed information for intelligent processing:
    
    Query: "${query}"
    Project: "${projectId}"
    
    Provide a comprehensive analysis in JSON format with the following structure:

    1. QUERY CLASSIFICATION
    - primary_type: Main query category
      Options: ["character_analysis", "relationship_analysis", "plot_analysis", "theme_analysis", 
               "setting_analysis", "literary_device", "factual", "comparative", "timeline", "meta"]
    - secondary_types: Array of additional relevant categories
    - complexity: 1-10 rating of query complexity
    - requires_inference: Whether answering needs inference beyond explicit facts
    
    2. ENTITY IDENTIFICATION
    - characters: Array of mentioned characters with roles ("protagonist", "subject", "comparison", etc.)
    - locations: Array of locations with context ("setting", "reference", "symbolic", etc.)
    - time_periods: Array of temporal references with type ("specific_time", "era", "story_phase", etc.)
    - events: Array of referenced events
    - themes: Array of relevant themes
    - symbols: Array of symbolic elements
    
    3. RELATIONSHIP MAPPING
    - character_relationships: Array of character pairs to analyze
    - location_connections: Array of connected locations to consider
    - event_chains: Array of causally connected events
    - thematic_links: Array of theme-element connections
    
    4. TEMPORAL ASPECTS
    - time_focus: "point", "period", "progression", "comparison"
    - chronology_type: "linear", "flashback", "parallel", "overview"
    - temporal_scope: "scene", "chapter", "arc", "full_story"
    
    5. ANALYTICAL REQUIREMENTS
    - context_needed: Array of context types needed
      Options: ["character_background", "prior_events", "future_impact", "thematic_context", 
               "relationship_history", "setting_details", "literary_significance"]
    - analysis_depth: Array of aspects to analyze deeply
      Options: ["motivation", "development", "symbolism", "causality", "impact", "pattern"]
    - comparison_points: Array of specific aspects to compare (if comparative)
    
    6. RESPONSE REQUIREMENTS
    - detail_level: "brief", "moderate", "detailed", "comprehensive"
    - evidence_type: Array of required evidence types
      Options: ["quotes", "events", "character_actions", "relationship_changes", "thematic_examples"]
    - structure_preference: "chronological", "thematic", "analytical", "comparative"
    
    Analyze the query carefully and provide appropriate values for all fields.
    `;

    const response = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 1000,
      stop: ['}'] // Stop after the JSON object closes
    });
    
    // Clean and parse the response
    const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim() + '}';
    const classification = JSON.parse(cleanedResponse);
    
    logger.info('Query classified successfully', {
      query,
      primary_type: classification.QUERY_CLASSIFICATION.primary_type,
      complexity: classification.QUERY_CLASSIFICATION.complexity
    });
    
    return {
      original_query: query,
      project_id: projectId,
      query_type: classification.QUERY_CLASSIFICATION.primary_type,
      secondary_types: classification.QUERY_CLASSIFICATION.secondary_types,
      complexity: classification.QUERY_CLASSIFICATION.complexity,
      requires_inference: classification.QUERY_CLASSIFICATION.requires_inference,
      entities: classification.ENTITY_IDENTIFICATION,
      relationships: classification.RELATIONSHIP_MAPPING,
      temporal_aspects: classification.TEMPORAL_ASPECTS,
      analytical_requirements: classification.ANALYTICAL_REQUIREMENTS,
      response_requirements: classification.RESPONSE_REQUIREMENTS
    };
  } catch (error) {
    logger.error('Error classifying query:', error);
    
    // Return basic classification on error
    return {
      original_query: query,
      project_id: projectId,
      query_type: 'unknown',
      secondary_types: [],
      complexity: 5,
      requires_inference: false,
      entities: {
        characters: [],
        locations: [],
        time_periods: [],
        events: [],
        themes: [],
        symbols: []
      },
      relationships: {
        character_relationships: [],
        location_connections: [],
        event_chains: [],
        thematic_links: []
      },
      temporal_aspects: {
        time_focus: 'point',
        chronology_type: 'linear',
        temporal_scope: 'full_story'
      },
      analytical_requirements: {
        context_needed: ['factual'],
        analysis_depth: ['basic'],
        comparison_points: []
      },
      response_requirements: {
        detail_level: 'moderate',
        evidence_type: ['events'],
        structure_preference: 'chronological'
      }
    };
  }
}

module.exports = {
  classifyQuery
};