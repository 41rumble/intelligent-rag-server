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
    
    // Log what we're working with
    logger.info('Compressing knowledge:', {
      query,
      doc_count: documents.length,
      doc_types: documents.map(d => d.type),
      doc_ids: documents.map(d => d._id)
    });

    const prompt = `
    Query: "${query}"

    Return ONLY a JSON object that answers this query using these sources:
    ${formattedDocs}

    {
      "compressed_text": "Direct answer to query with [1] style citations",
      "key_points": [
        "Key fact 1 with [2] citation",
        "Key fact 2 with [1][3] citations"
      ],
      "source_ids": ["doc_id_1", "doc_id_2"],
      "source_snippets": [
        {
          "id": "doc_id_1",
          "text": "Relevant 50-word quote",
          "relevance": "One line explaining relevance"
        }
      ]
    }

    REQUIREMENTS:
    1. ONLY return the JSON object
    2. Focus ONLY on information relevant to query
    3. Use [1], [2] etc. citations for every fact
    4. Keep snippets under 50 words
    5. Only include relevant sources
    `;

    try {
      const result = await generateStructuredResponse(prompt, {
        temperature: 0.3,
        maxTokens: 1500,
        systemPrompt: "You are a JSON-only assistant that focuses on relevant information."
      });
      
      // Validate result structure
      if (!result || typeof result !== 'object') {
        logger.error('Invalid result from generateStructuredResponse:', { result });
        throw new Error('Invalid response format');
      }

      // Ensure required fields exist and are correct types
      result.compressed_text = typeof result.compressed_text === 'string' ? result.compressed_text : '';
      result.key_points = Array.isArray(result.key_points) ? result.key_points : [];
      result.source_ids = Array.isArray(result.source_ids) ? result.source_ids : [];
      result.source_snippets = Array.isArray(result.source_snippets) ? result.source_snippets : [];

      // Validate content
      if (!result.compressed_text && result.key_points.length === 0) {
        logger.warn('Empty response from LLM:', {
          query,
          doc_count: documents.length,
          prompt_length: prompt.length
        });
        throw new Error('No relevant information found');
      }

      // Log success with details
      logger.info('Knowledge compressed:', { 
        query,
        compressed_length: result.compressed_text.length,
        key_points_count: result.key_points.length,
        source_count: result.source_ids.length,
        has_citations: result.compressed_text.includes('['),
        snippet_count: result.source_snippets.length
      });
      
      return {
        ...result,
        metadata: {
          input_docs: documents.length,
          output_length: result.compressed_text.length,
          has_citations: result.compressed_text.includes('['),
          source_coverage: result.source_ids.length / documents.length
        }
      };
    } catch (error) {
      logger.error('Error in knowledge compression:', {
        error: error.message,
        query,
        doc_count: documents.length
      });
      
      return {
        compressed_text: 'Failed to compress knowledge: ' + error.message,
        key_points: [],
        source_ids: [],
        source_snippets: [],
        error: error.message,
        metadata: {
          input_docs: documents.length,
          error_type: error.name,
          error_message: error.message
        }
      };
    }
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
    Query: "${query}"

    Return ONLY a JSON object that synthesizes this conversation:
    ${conversation}

    {
      "compressed_text": "Direct answer to query with [1] style citations",
      "key_points": [
        "Key fact 1 with [2] citation",
        "Key fact 2 with [1][3] citations"
      ],
      "source_ids": ["doc_id_1", "doc_id_2"],
      "source_snippets": [
        {
          "id": "doc_id_1",
          "text": "Relevant 50-word quote",
          "relevance": "One line explaining relevance"
        }
      ]
    }

    REQUIREMENTS:
    1. ONLY return the JSON object
    2. Focus ONLY on information relevant to query
    3. Use [1], [2] etc. citations for every fact
    4. Keep snippets under 50 words
    5. Only include relevant sources
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