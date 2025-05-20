const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');

/**
 * Middleware to enforce book context and validate queries
 */
class BookContextEnforcer {
  /**
   * Validate and enforce book context for queries
   * @param {string} query - User query
   * @param {string} projectId - Project/book identifier
   * @returns {Object} Validated and contextualized query
   * @throws {Error} If query is not book-related
   */
  static async enforceContext(query, projectId) {
    // Quick rejection patterns
    const nonBookPatterns = [
      /current weather/i,
      /what time/i,
      /who are you/i,
      /your name/i,
      /how old/i,
      /where.*you.*from/i,
      /news/i,
      /stock.*price/i,
      /sports/i,
      /\d{4}-\d{2}-\d{2}/  // dates in YYYY-MM-DD format
    ];

    if (nonBookPatterns.some(pattern => pattern.test(query))) {
      throw new Error('This query appears to be unrelated to the book. Please ask questions about the book\'s content, characters, plot, or themes.');
    }

    // Enforce book context in the query
    const bookContextPrompt = `
    Analyze if this query is specifically about a book's content:
    "${query}"

    Requirements:
    1. Must be about the book's:
       - Characters
       - Plot
       - Themes
       - Settings
       - Events
       - Relationships
       - Literary elements
    2. Should not be about:
       - Real-world current events
       - Personal questions
       - General knowledge
       - Other books/media

    Respond with a JSON object:
    {
      "isBookQuery": boolean,
      "confidence": 0-1,
      "queryType": "character"|"plot"|"theme"|"setting"|"relationship"|"meta"|null,
      "suggestedRewrite": string (only if query needs more book context)
    }
    `;

    const analysis = await generateStructuredResponse(bookContextPrompt, {
      temperature: 0.1,
      maxTokens: 150
    });

    if (!analysis.isBookQuery) {
      if (analysis.suggestedRewrite) {
        logger.info('Rewriting query to enforce book context:', analysis.suggestedRewrite);
        return {
          original: query,
          rewritten: analysis.suggestedRewrite,
          type: analysis.queryType
        };
      }
      throw new Error('Please ask questions specifically about the book\'s content, characters, or story.');
    }

    return {
      original: query,
      rewritten: query,
      type: analysis.queryType
    };
  }

  /**
   * Add book-specific context to the query
   * @param {string} query - Validated query
   * @param {string} queryType - Type of query
   * @returns {string} Enhanced query
   */
  static enhanceWithBookContext(query, queryType) {
    const contextPrefixes = {
      character: "Regarding the character in the book, ",
      plot: "In the story's plot, ",
      theme: "Considering the book's themes, ",
      setting: "In the book's setting, ",
      relationship: "Regarding the relationship between characters, ",
      meta: "About the book's "
    };

    return `${contextPrefixes[queryType] || 'In the book, '}${query}`;
  }
}

module.exports = BookContextEnforcer;