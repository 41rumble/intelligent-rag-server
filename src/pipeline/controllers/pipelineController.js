const logger = require('../../utils/logger');
const QueryExpander = require('../services/queryExpander');
const MultiSourceSearch = require('../services/multiSourceSearch');
const InfoSynthesizer = require('../services/infoSynthesizer');
const { generateStructuredResponse } = require('../../utils/llmProvider');

/**
 * Controller for managing the RAG pipeline
 */
class PipelineController {
  constructor(projectId) {
    this.projectId = projectId;
    this.queryExpander = new QueryExpander();
    this.multiSourceSearch = new MultiSourceSearch(projectId);
    this.infoSynthesizer = new InfoSynthesizer();
  }

  /**
   * Process a query through the pipeline
   * @param {string} query - User's query
   * @param {number} thinkingDepth - Depth level (1-4)
   * @returns {Promise<Object>} Processed result
   */
  async process(query, thinkingDepth = 1) {
    try {
      logger.info(`Processing query at thinking depth ${thinkingDepth}: ${query}`);

      // Step 1: Expand query
      const expandedQuery = await this.queryExpander.expandQuery(query);
      logger.debug('Expanded query:', expandedQuery);

      // Step 2: Search across sources
      const searchResults = await this.multiSourceSearch.search(
        expandedQuery,
        thinkingDepth
      );
      logger.debug('Search results:', {
        rag: searchResults.rag.length,
        db: searchResults.db.length,
        web: searchResults.web.length
      });

      // Step 3: Synthesize information
      const synthesized = await this.infoSynthesizer.synthesize(
        searchResults,
        thinkingDepth
      );
      logger.debug('Synthesized information:', {
        keyPoints: synthesized.keyPoints.length,
        timeline: synthesized.timeline.length,
        relationships: synthesized.relationships.length
      });

      // Step 4: Generate final answer
      const answer = await this.generateAnswer(
        query,
        expandedQuery,
        synthesized,
        thinkingDepth
      );

      return {
        answer,
        supporting_info: synthesized,
        metadata: {
          thinking_depth: thinkingDepth,
          expanded_queries: expandedQuery,
          sources: {
            rag: searchResults.rag.length,
            db: searchResults.db.length,
            web: searchResults.web.length
          }
        }
      };
    } catch (error) {
      logger.error('Error in pipeline processing:', error);
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
  async generateAnswer(originalQuery, expandedQuery, synthesized, thinkingDepth) {
    const prompt = `
    Answer this question: "${originalQuery}"

    Use the following information to provide a comprehensive answer:

    Key Points:
    ${synthesized.keyPoints.join('\n')}

    Timeline:
    ${synthesized.timeline.map(t => 
      `${t.date}: ${t.events.join(', ')}`
    ).join('\n')}

    Relationships:
    ${synthesized.relationships.map(r =>
      `${r.entities.join(' & ')}: ${r.descriptions.join('; ')}`
    ).join('\n')}

    ${synthesized.summary ? `
    Summary:
    ${JSON.stringify(synthesized.summary, null, 2)}
    ` : ''}

    Format your response as a JSON object with:
    - answer: Main answer to the question (2-3 paragraphs)
    - key_points: Array of 3-5 most important points
    - sources: Array of sources used (from the provided information)
    - confidence: Number between 0-1 indicating confidence in the answer
    - follow_up: Array of 2-3 suggested follow-up questions
    `;

    return await generateStructuredResponse(prompt, {
      temperature: 0.3
    });
  }
}

module.exports = PipelineController;