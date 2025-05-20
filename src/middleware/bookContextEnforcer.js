const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
const mongoClient = require('../utils/mongoClient');

/**
 * Get book metadata for a project
 * @param {string} projectId - Project identifier
 * @returns {Promise<Object>} Book metadata
 */
async function getBookMetadata(projectId) {
  try {
    const collection = await mongoClient.getProjectCollection(projectId);
    const metadata = await collection.findOne({ type: 'book_metadata' });
    return metadata;
  } catch (error) {
    logger.error('Error getting book metadata:', error);
    return null;
  }
}

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

    // Get book metadata
    const bookMetadata = await getBookMetadata(projectId);
    
    // Enforce book context in the query
    const bookContextPrompt = `
    Analyze if this query is specifically about the book "${bookMetadata?.title || 'the book'}" by ${bookMetadata?.author || 'the author'}:
    "${query}"

    Book Context:
    - Title: ${bookMetadata?.title || 'Unknown'}
    - Author: ${bookMetadata?.author || 'Unknown'}
    - Time Period: ${bookMetadata?.time_period?.start || 'Unknown'} to ${bookMetadata?.time_period?.end || 'Unknown'}
    - Publication Year: ${bookMetadata?.publication_year || 'Unknown'}
    ${bookMetadata?.description ? `- Description: ${bookMetadata.description}` : ''}
    ${bookMetadata?.genre?.length ? `- Genres: ${bookMetadata.genre.join(', ')}` : ''}

    Requirements:
    1. Must be about this specific book's:
       - Characters
       - Plot
       - Themes
       - Settings (especially during ${bookMetadata?.time_period?.start || 'the book\'s time period'})
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
  static async enhanceWithBookContext(query, queryType, projectId) {
    const bookMetadata = await getBookMetadata(projectId);
    
    const contextPrefixes = {
      character: `Regarding the character in "${bookMetadata?.title || 'the book'}", `,
      plot: `In the story's plot of "${bookMetadata?.title || 'the book'}", `,
      theme: `Considering the themes in "${bookMetadata?.title || 'the book'}", `,
      setting: `In the book's setting (${bookMetadata?.time_period?.start || ''} to ${bookMetadata?.time_period?.end || ''}), `,
      relationship: `Regarding the relationship between characters in "${bookMetadata?.title || 'the book'}", `,
      meta: `About "${bookMetadata?.title || 'the book'}"'s `
    };

    return `${contextPrefixes[queryType] || `In "${bookMetadata?.title || 'the book'}", `}${query}`;
  }
}

module.exports = BookContextEnforcer;