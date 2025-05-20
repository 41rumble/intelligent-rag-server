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
    Analyze this query about project/book "${projectId}" and extract detailed information for processing.
    CRITICAL: This is a RAG system - all answers MUST be based on the content of THIS SPECIFIC project/book.
    
    Query: "${query}"
    Project ID: "${projectId}"
    
    IMPORTANT RULES:
    1. Every response must be based on THIS project's content ONLY
    2. Do not reference other books, general knowledge, or external information
    3. If query seems unrelated, reframe it to be about this project
    4. Assume all questions are asking about this project's content
    
    Provide a comprehensive analysis in JSON format with the following structure:

    1. QUERY CLASSIFICATION
    - primary_type: Main query category for THIS project
      Options: ["character_analysis", "relationship_analysis", "plot_analysis", "theme_analysis", 
               "setting_analysis", "literary_device", "factual", "comparative", "timeline", "meta"]
    - secondary_types: Array of additional relevant categories
    - complexity: 1-10 rating of query complexity
    - requires_inference: Whether answering needs inference beyond explicit facts
    - project_specific: true (always true - all queries are about this project)
    
    2. ENTITY IDENTIFICATION (from THIS project only)
    - characters: Array of mentioned characters with roles ("protagonist", "subject", "comparison", etc.)
    - locations: Array of locations with context ("setting", "reference", "symbolic", etc.)
    - time_periods: Array of temporal references with type ("specific_time", "era", "story_phase", etc.)
    - events: Array of referenced events
    - themes: Array of relevant themes
    - symbols: Array of symbolic elements
    
    3. RELATIONSHIP MAPPING (within THIS project)
    - character_relationships: Array of character pairs to analyze
    - location_connections: Array of connected locations to consider
    - event_chains: Array of causally connected events
    - thematic_links: Array of theme-element connections
    
    4. TEMPORAL ASPECTS (of THIS project)
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
    - requires_project_context: true (always true - all answers need project context)
    
    7. PROJECT FOCUS
    - is_project_specific: true (always true)
    - needs_reframing: boolean (true if query needs to be reframed to be about this project)
    - reframed_query: String (if needs_reframing is true, provide project-specific version)
    
    Example Reframing:
    "What is love?" -> "How is love portrayed in this specific project/book?"
    "Who are you?" -> "What characters appear in this project/book?"
    "Tell me about WW2" -> "How does this project/book handle historical events or conflicts?"
    
    Analyze the query carefully and provide appropriate values for all fields.
    Remember: EVERY answer must be based on THIS project's content ONLY.
    `;

    const classification = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 500
    });
    
    logger.info('Query classified:', { 
      query, 
      query_type: classification.query_type,
      complexity: classification.query_complexity
    });
    
    return {
      ...classification,
      original_query: query,
      project_id: projectId
    };
  } catch (error) {
    logger.error('Error classifying query:', error);
    
    // Return basic classification on error
    return {
      people: [],
      locations: [],
      time_periods: [],
      topics: [],
      query_type: 'unknown',
      query_complexity: 5,
      original_query: query,
      project_id: projectId
    };
  }
}

module.exports = {
  classifyQuery
};