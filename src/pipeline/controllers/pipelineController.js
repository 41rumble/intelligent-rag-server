const logger = require('../../utils/logger');
const { classifyQuery } = require('../queryClassifier');
const QueryExpander = require('../services/queryExpander');
const QueryRouter = require('../services/queryRouter');
const InfoSynthesizer = require('../services/infoSynthesizer');
const ResponseManager = require('../services/responseManager');
const BookContextEnforcer = require('../../middleware/bookContextEnforcer');
const { generateStructuredResponse } = require('../../utils/llmProvider');
const { v4: uuidv4 } = require('uuid');

/**
 * Controller for managing the RAG pipeline
 */
class PipelineController {
  constructor(projectId) {
    this.projectId = projectId;
    this.queryExpander = new QueryExpander();
    this.queryRouter = new QueryRouter(projectId);
    this.infoSynthesizer = new InfoSynthesizer();
    this.responseManager = new ResponseManager();

    // Set up response manager event handling
    this.responseManager.on('update', (requestId, update) => {
      // This will be connected to the WebSocket/SSE handler
      logger.debug('Response update:', { requestId, type: update.type });
    });
  }

  /**
   * Process a query through the pipeline
   * @param {string} query - User's query
   * @param {number} thinkingDepth - Depth level (1-4)
   * @returns {Promise<Object>} Processed result
   */
  async process(query, thinkingDepth = 1) {
    const requestId = uuidv4();
    const responseController = this.responseManager.initializeStream(requestId);

    try {
      logger.info(`Processing query at thinking depth ${thinkingDepth}: ${query}`);

      // Step 1: Enforce book context
      const contextualizedQuery = await BookContextEnforcer.enforceContext(query, this.projectId);
      query = BookContextEnforcer.enhanceWithBookContext(
        contextualizedQuery.rewritten,
        contextualizedQuery.type
      );

      // Step 2: Classify query
      const classification = await classifyQuery(query, this.projectId);
      logger.debug('Query classification:', {
        type: classification.primary_type,
        complexity: classification.complexity
      });

      // Process through RAG pipeline
      const expandedQuery = await this.queryExpander.expandQuery(query, classification);
      await this.responseManager.addUpdate(requestId, {
        stage: 'query_expansion',
        expanded: expandedQuery
      });

      // Get search results - thinking depth controls amount of context
      const searchResults = await this.queryRouter.routeQuery({
        ...classification,
        original_query: query,
        expanded_query: expandedQuery,
        thinking_depth: thinkingDepth
      });
      await this.responseManager.addUpdate(requestId, {
        stage: 'search_complete',
        result_counts: {
          primary: searchResults.primary.length,
          supporting: searchResults.supporting.length,
          context: searchResults.context.length
        }
      });

      // Synthesize information
      const synthesized = await this.infoSynthesizer.synthesize(
        {
          primary: searchResults.primary,
          supporting: searchResults.supporting,
          context: searchResults.context
        },
        {
          ...classification,
          thinking_depth: thinkingDepth
        }
      );

      // Generate answer using RAG context
      const answer = await this.generateAnswer(
        query,
        {
          classification,
          expanded_query: expandedQuery,
          synthesized,
          thinking_depth: thinkingDepth
        }
      );

      // Return complete response
      return {
        requestId,
        answer,
        supporting_info: synthesized,
        metadata: {
          classification: {
            primary_type: classification.primary_type,
            secondary_types: classification.secondary_types,
            complexity: classification.complexity,
            requires_inference: classification.requires_inference
          },
          temporal_aspects: classification.temporal_aspects,
          analysis_depth: classification.analysis_depth,
          thinking_depth: thinkingDepth,
          expanded_queries: expandedQuery,
          sources: {
            primary: searchResults.primary.length,
            supporting: searchResults.supporting.length,
            context: searchResults.context.length
          }
        }
      };

    } catch (error) {
      logger.error('Error in pipeline processing:', error);
      this.responseManager.handleError(requestId, error);
      throw error;
    }
  }



  /**
   * Generate final answer using LLM
   * @param {string} originalQuery - Original user query
   * @param {Object} expandedQuery - Expanded queries
   * @param {Object} synthesized - Synthesized information
   * @param {number} thinkingDepth - Depth level
   * @returns {Promise<Object>} Generated answer
   */
  async generateAnswer(originalQuery, context) {
    const { classification, expanded_query, synthesized, thinking_depth } = context;

    // Build type-specific prompt sections
    const sections = [];

    // Add synthesized information based on query type
    if (synthesized.keyPoints?.length > 0) {
      sections.push(`Key Points:\n${synthesized.keyPoints.join('\n')}`);
    }

    if (synthesized.timeline?.length > 0) {
      sections.push(`Timeline:\n${synthesized.timeline.map(t => 
        `${t.date}: ${t.events.join(', ')}`
      ).join('\n')}`);
    }

    if (synthesized.relationships?.length > 0) {
      sections.push(`Relationships:\n${synthesized.relationships.map(r =>
        `${r.entities.join(' & ')}: ${r.descriptions.join('; ')}`
      ).join('\n')}`);
    }

    if (synthesized.analysis) {
      sections.push(`Analysis:\n${JSON.stringify(synthesized.analysis, null, 2)}`);
    }

    // Add query-type specific instructions
    const typeInstructions = {
      character_analysis: `
        Focus on:
        - Character development and arc
        - Key personality traits and their evidence
        - Significant relationships and their impact
        - Motivations and their evolution
      `,
      relationship_analysis: `
        Focus on:
        - Relationship dynamics and their changes
        - Key events that affected the relationship
        - Power balance and emotional bonds
        - Impact on both characters
      `,
      theme_analysis: `
        Focus on:
        - Theme manifestations throughout the story
        - Supporting symbols and motifs
        - Character and plot connections
        - Thematic progression
      `,
      plot_analysis: `
        Focus on:
        - Event causality and consequences
        - Character motivations and decisions
        - Plot structure and pacing
        - Significant turning points
      `,
      setting_analysis: `
        Focus on:
        - Setting details and atmosphere
        - Symbolic significance
        - Impact on characters and plot
        - Changes over time
      `
    };

    const prompt = `
    Analyze and answer this question about the book: "${originalQuery}"

    Query Classification:
    - Type: ${classification.primary_type}
    - Complexity: ${classification.complexity}
    - Requires Inference: ${classification.requires_inference}
    
    ${typeInstructions[classification.primary_type] || ''}

    Available Information:
    ${sections.join('\n\n')}

    Response Requirements:
    - Detail Level: ${classification.detail_level}
    - Evidence Types Needed: ${classification.evidence_type.join(', ')}
    - Structure: ${classification.structure_preference}

    Format your response as a JSON object with:
    - answer: Main answer (${classification.detail_level === 'comprehensive' ? '3-4' : '1-2'} paragraphs)
    - key_points: Array of ${classification.complexity >= 7 ? '5-7' : '3-5'} most important points
    - evidence: Array of specific evidence used (quotes, events, etc.)
    - analysis: Object containing type-specific analysis based on query type
    - confidence: Number between 0-1 indicating confidence
    - follow_up: Array of 2-3 suggested follow-up questions
    `;

    return await generateStructuredResponse(prompt, {
      temperature: 0.3
    });
  }
}

module.exports = PipelineController;