const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
require('dotenv').config();

/**
 * Compress multiple knowledge sources into a coherent summary
 * @param {Array} documents - Retrieved documents
 * @param {string} query - Original query
 * @returns {Promise<Object>} Compressed knowledge
 */
async function compressKnowledge(documents, query) {
  try {
    if (documents.length === 0) {
      return {
        compressed_text: 'No relevant information found.',
        key_points: [],
        source_ids: [],
        source_snippets: []
      };
    }
    
    // Format documents for the prompt
    const formattedDocs = documents.map((doc, index) => {
      let content = '';
      
      if (doc.type === 'chapter_synopsis') {
        content = `Title: ${doc.title || 'Unknown'}\n${doc.text}`;
      } else if (doc.type === 'bio') {
        content = `Name: ${doc.name || 'Unknown'}\n${doc.text}`;
      } else {
        content = doc.text || '';
      }
      
      return `[${index + 1}] Type: ${doc.type}\nID: ${doc._id}\n${content}`;
    }).join('\n\n');
    
    const prompt = `
    Compress and synthesize the following information to answer this query: "${query}"
    
    DOCUMENTS:
    ${formattedDocs}
    
    Create a coherent synthesis that:
    1. Directly addresses the query
    2. Combines information from multiple sources
    3. Resolves any contradictions
    4. Maintains factual accuracy
    5. Cites which source number ([1], [2], etc.) each piece of information comes from
    
    Format your response as a JSON object with:
    - compressed_text: A coherent, comprehensive answer to the query
    - key_points: An array of the most important points
    - source_ids: An array of the document IDs that were most relevant
    - source_snippets: An array of objects, each containing:
      * id: The document ID
      * text: A relevant snippet from the source (max 100 words)
      * relevance: Brief explanation of how this snippet supports the answer
    `;

    const result = await generateStructuredResponse(prompt, {
      temperature: 0.3,
      maxTokens: 1500
    });
    
    logger.info('Knowledge compressed:', { 
      query,
      compressed_length: result.compressed_text.length,
      key_points_count: result.key_points.length
    });
    
    return result;
  } catch (error) {
    logger.error('Error compressing knowledge:', error);
    return {
      compressed_text: 'Failed to compress knowledge due to an error.',
      key_points: [],
      source_ids: []
    };
  }
}

/**
 * Handle oversized context by processing in chunks
 * @param {Array} documents - Retrieved documents
 * @param {string} query - Original query
 * @returns {Promise<Object>} Compressed knowledge
 */
async function handleOversizedContext(documents, query) {
  try {
    // If documents are small enough, process normally
    if (documents.length <= 5) {
      return await compressKnowledge(documents, query);
    }
    
    // Split documents into chunks of 5
    const chunks = [];
    for (let i = 0; i < documents.length; i += 5) {
      chunks.push(documents.slice(i, i + 5));
    }
    
    logger.info(`Processing ${chunks.length} chunks for oversized context`);
    
    // Process each chunk
    let conversation = `Query: "${query}"\n\n`;
    let allSourceIds = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Add context from previous chunks
      const chunkPrompt = `
      This is part ${i + 1} of ${chunks.length} of our conversation about: "${query}"
      
      ${i > 0 ? 'Previous information summary:\n' + conversation : ''}
      
      Now, consider these additional documents and update your understanding:
      `;
      
      // Compress this chunk
      const chunkResult = await compressKnowledge(chunk, chunkPrompt);
      
      // Add to conversation
      conversation += `\nPart ${i + 1} Summary:\n${chunkResult.compressed_text}\n`;
      
      // Collect source IDs
      allSourceIds = [...allSourceIds, ...chunkResult.source_ids];
    }
    
    // Final synthesis of the entire conversation
    const finalPrompt = `
    Now that you've analyzed all parts of the information about: "${query}"
    
    Full conversation:
    ${conversation}
    
    Create a final, coherent synthesis that:
    1. Directly addresses the original query
    2. Combines all the information from our conversation
    3. Resolves any contradictions
    4. Maintains factual accuracy
    
    Format your response as a JSON object with:
    - compressed_text: A coherent, comprehensive answer to the query
    - key_points: An array of the most important points
    - source_ids: An array of the document IDs that were most relevant
    - source_snippets: An array of objects, each containing:
      * id: The document ID
      * text: A relevant snippet from the source (max 100 words)
      * relevance: Brief explanation of how this snippet supports the answer
    `;

    const result = await generateStructuredResponse(finalPrompt, {
      temperature: 0.3,
      maxTokens: 1500
    });
    
    // Add all source IDs if not provided in final result
    if (!result.source_ids || result.source_ids.length === 0) {
      result.source_ids = [...new Set(allSourceIds)];
    }
    
    logger.info('Oversized context processed:', { 
      query,
      chunks_count: chunks.length,
      final_length: result.compressed_text.length
    });
    
    return result;
  } catch (error) {
    logger.error('Error handling oversized context:', error);
    return {
      compressed_text: 'Failed to process oversized context due to an error.',
      key_points: [],
      source_ids: [],
      source_snippets: []
    };
  }
}

module.exports = {
  compressKnowledge,
  handleOversizedContext
};