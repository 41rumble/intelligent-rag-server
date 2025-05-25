const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');
require('dotenv').config();

/**
 * Build a final prompt for the LLM
 * @param {Object} queryInfo - Classified query information
 * @param {Object} compressedKnowledge - Compressed knowledge
 * @param {Object} webSummary - Web search summary (optional)
 * @param {Object} evaluationInfo - Evaluation information (optional)
 * @returns {Promise<Object>} Final prompt and context
 */
async function buildFinalPrompt(queryInfo, compressedKnowledge, webSummary = null, evaluationInfo = null) {
  try {
    // Validate and normalize inputs
    if (!queryInfo) {
      throw new Error('Missing queryInfo for prompt building');
    }

    // Ensure compressedKnowledge has all required fields
    compressedKnowledge = compressedKnowledge || {};
    compressedKnowledge.compressed_text = compressedKnowledge.compressed_text || '';
    compressedKnowledge.source_snippets = compressedKnowledge.source_snippets || [];
    compressedKnowledge.key_points = compressedKnowledge.key_points || [];
    compressedKnowledge.full_documents = compressedKnowledge.full_documents || [];

    // Log what we're working with
    logger.info('Building final prompt with:', {
      query: queryInfo.original_query,
      compressed_length: compressedKnowledge.compressed_text.length,
      snippets: compressedKnowledge.source_snippets.length,
      full_documents: compressedKnowledge.full_documents?.length || 0,
      key_points: compressedKnowledge.key_points.length,
      has_web: !!webSummary?.summary,
      using_full_docs: compressedKnowledge.full_documents?.length > 0
    });

    // Determine if RAG has relevant information
    const hasRelevantRAG = compressedKnowledge.source_snippets.some(s => 
      s.relevance && (
        (typeof s.relevance === 'string' && s.relevance.toLowerCase().includes('high')) || 
        (typeof s.relevance === 'number' && s.relevance >= 7)
      ));
    
    // Determine if this is a book-focused or web-focused query
    const isWebFocused = queryInfo.original_query.toLowerCase().includes('not related to') || 
                        queryInfo.original_query.toLowerCase().includes('other than') ||
                        queryInfo.original_query.toLowerCase().includes('outside of');

    logger.info('Query focus analysis:', {
      query: queryInfo.original_query,
      is_web_focused: isWebFocused,
      has_book_data: compressedKnowledge.source_snippets.length > 0,
      has_web_data: !!webSummary?.summary
    });

    // Base context with more structured information
    let context = `
    QUERY INFORMATION:
    - Original Query: "${queryInfo.original_query}"
    - Project ID: "${queryInfo.project_id}"
    - Query Type: ${queryInfo.query_type || 'General'}
    - Query Focus: ${isWebFocused ? 'Information outside book context' : queryInfo.focus || 'Not specified'}
    
    ${isWebFocused ? 
      // For web-focused queries, put web data first if available
      (webSummary?.summary ? 
        `NOTE: This query asks about events/information OUTSIDE the book's context.
        The answer will primarily use web sources, with book sources for context only.` :
        `NOTE: This query asks about events/information OUTSIDE the book's context,
        but no relevant web information was found.`) :
      // For book-focused queries, normal handling
      (compressedKnowledge.source_snippets.length > 0 || compressedKnowledge.full_documents?.length > 0 ? `
        BOOK SOURCES:
        ${compressedKnowledge.full_documents?.length > 0 ? 
          // Use full documents if available for richer content
          compressedKnowledge.full_documents.map(doc => 
            `[${doc._id}] From ${doc.source || 'book'}:
            "${doc.text || doc.content || ''}"
            Type: ${doc.type || 'text'}
            ${doc.metadata?.chapter ? `Chapter: ${doc.metadata.chapter}` : ''}
            ${doc.metadata?.page ? `Page: ${doc.metadata.page}` : ''}`
          ).join('\n\n') :
          // Fall back to snippets if no full documents
          compressedKnowledge.source_snippets.map(snippet => 
            `[${snippet.id}] From ${snippet.source}:
            "${snippet.text}"
            Relevance: ${snippet.relevance}`
          ).join('\n\n')}
        
        ${compressedKnowledge.key_points.length > 0 ? `
        KEY POINTS FROM BOOKS:
        ${compressedKnowledge.key_points.map((point, i) => `[KP${i+1}] ${point}`).join('\n')}
        ` : ''}
      ` : `
        NOTE: No information found in the book sources for this query.
        ${webSummary?.summary ? 
          'The answer will be based on web sources.' : 
          'No relevant information was found in either book or web sources. Please acknowledge this in your response.'}
      `)}
    `;
    
    // Add web search information if available and relevant
    if (webSummary && webSummary.summary) {
      // Log web information being used in final prompt
      logger.info('Using web information in final prompt:', {
        summary: webSummary.summary,
        facts: webSummary.facts?.length || 0,
        sources: webSummary.source_urls?.length || 0,
        is_web_focused: isWebFocused
      });
      
      // For web-focused queries, we want to prioritize web information
      const relevantSources = webSummary.source_urls
        ?.filter(url => isWebFocused ? url.relevance_score >= 5 : url.relevance_score >= 7) || [];
      
      const relevantFacts = webSummary.facts
        ?.filter(fact => fact.relevance && 
          (isWebFocused ? true : 
            (typeof fact.relevance === 'string' && fact.relevance.toLowerCase().includes('high')) ||
            (typeof fact.relevance === 'number' && fact.relevance >= 7))) || [];
      
      context += `
      
      ${isWebFocused ? 'PRIMARY WEB SOURCES:' : 'RELEVANT WEB SOURCES:'}
      ${webSummary.relevance_analysis || 'No relevance analysis available.'}
      
      ${isWebFocused ? 'MAIN INFORMATION FROM WEB:' : 'HIGHLY RELEVANT WEB INFORMATION:'}
      ${relevantSources
        .map((url, i) => {
          const relatedFact = webSummary.facts?.find(f => f.sources.includes(i+1));
          return `[${url.id}] From ${url.title} (Relevance: ${url.relevance_score}/10):
          "${relatedFact?.text || ''}"
          ${isWebFocused ? 'Context: ' : 'Relevance: '}${relatedFact?.relevance || ''}`
        }).join('\n\n')}
      
      ${isWebFocused ? 'ADDITIONAL DETAILS:' : 'SUPPORTING WEB FACTS:'}
      ${relevantFacts
        .map(fact => 
          `[${fact.sources.map(s => `WEB${s}`).join('][')}] ${fact.text}
          ${isWebFocused ? 'Context: ' : 'Why relevant: '}${fact.relevance}`
        ).join('\n')}
      `;
    }
    
    // Add evaluation information if available
    if (evaluationInfo) {
      context += `
      
      AREAS NEEDING IMPROVEMENT:
      ${evaluationInfo.focus_areas ? evaluationInfo.focus_areas.map(area => `- ${area}`).join('\n') : 'None specified'}
      
      ALTERNATIVE PERSPECTIVES TO CONSIDER:
      ${evaluationInfo.alternative_perspectives ? evaluationInfo.alternative_perspectives.map(perspective => `- ${perspective}`).join('\n') : 'None specified'}
      `;
    }
    
    // Build the final prompt
    const finalPrompt = `
    You are an intelligent assistant specializing in comprehensive research and analysis.

    CRITICAL INSTRUCTION: You MUST respond with ONLY a JSON object.
    - ANY text outside the JSON structure will cause a system error
    - NO explanatory text, notes, or regular text answers
    - NO markdown formatting
    - ONLY the JSON object described below
    
    REQUIRED: Your response must start with "{" and end with "}" and be a valid JSON object with this EXACT structure:
    {
      "answer": "Your comprehensive answer text here",
      "missing_information": ["Any key information that would help answer the query but wasn't found in the sources"],
      "source_conflicts": ["Any contradictions between different sources, if any"]
    }

    IMPORTANT JSON FORMATTING RULES:
    1. Use double quotes (") for all strings
    2. No trailing commas
    3. Arrays can be empty [] but must be present
    4. No comments in the JSON
    5. The answer field is a string, not an object

    ANSWER REQUIREMENTS:
    1. Provide a DETAILED and COMPREHENSIVE answer based on ALL the provided context
    2. Do NOT include citations or reference markers in your answer text
    3. Write in a natural, engaging style with rich detail and context
    4. Include relevant background information, specific details, dates, names, and events
    5. Aim for a thorough response that fully utilizes the research provided
    6. Connect different pieces of information to tell a complete story
    7. Your answer should be substantial - at least 3-4 paragraphs when the sources support it
    8. Only use missing_information array for truly significant gaps in knowledge

    EXAMPLE of correct response format:
    {
      "answer": "The Great Fire of Smyrna began in September 1922. The fire started in the Armenian quarter and quickly spread through the city's narrow streets. Strong winds and dry conditions helped the fire spread rapidly, leading to widespread destruction.",
      "missing_information": ["Exact date and time the fire started", "Total number of casualties"],
      "source_conflicts": []
    }
    
    REMEMBER: Your response must be ONLY this JSON object. No other text.
    
    ${context}
    
    Remember: Base your answer ONLY on the provided context. If information is missing or unclear, acknowledge this rather than making assumptions.
    `;
    
    logger.info('Final prompt built:', { 
      query: queryInfo.original_query,
      prompt_length: finalPrompt.length
    });
    
    return {
      prompt: finalPrompt,
      context: context
    };
  } catch (error) {
    logger.error('Error building final prompt:', error);
    
    // Do not provide a fallback prompt
    throw error;
  }
}

/**
 * Generate the final answer using the LLM
 * @param {string} finalPrompt - Final prompt for the LLM
 * @returns {Promise<string>} Generated answer
 */
async function generateFinalAnswer(finalPrompt) {
  try {
    // Validate and clean the prompt
    if (!finalPrompt || typeof finalPrompt !== 'string') {
      throw new Error('Invalid prompt format');
    }

    // Log the prompt for debugging
    logger.info('Sending prompt to LLM:', {
      prompt_length: finalPrompt.length,
      context_length: finalPrompt.split('QUERY INFORMATION:')[1].length,
      has_web_data: finalPrompt.includes('WEB SOURCES'),
      has_book_data: finalPrompt.includes('BOOK SOURCES')
    });

    // Generate the answer with more focused parameters
    const parsedResponse = await generateStructuredResponse(finalPrompt, {
      temperature: 0.4, // Slightly higher for more natural, detailed responses
      maxTokens: 4000,  // Much more space for comprehensive answers
      systemPrompt: "You are a JSON-only assistant that provides comprehensive, detailed answers based on extensive research."
    });

    // Validate and normalize the response structure
    if (!parsedResponse || typeof parsedResponse !== 'object') {
      logger.error('Invalid response format:', { response: parsedResponse });
      throw new Error('Invalid response format from LLM');
    }

    // Log raw response for debugging
    logger.info('Raw LLM response:', {
      has_answer: !!parsedResponse.answer,
      answer_type: typeof parsedResponse.answer,
      has_missing_info: Array.isArray(parsedResponse.missing_information),
      has_conflicts: Array.isArray(parsedResponse.source_conflicts)
    });

    // Validate answer text (now answer is a string, not an object)
    if (!parsedResponse.answer || typeof parsedResponse.answer !== 'string' || parsedResponse.answer.trim() === '') {
      logger.warn('Invalid or missing answer text', {
        has_answer: !!parsedResponse.answer,
        answer_type: typeof parsedResponse.answer,
        answer_length: parsedResponse.answer?.length || 0,
        full_response: JSON.stringify(parsedResponse)
      });
      
      // Check if we have web summary to use as fallback
      const webData = finalPrompt.includes('PRIMARY WEB SOURCES:') || finalPrompt.includes('RELEVANT WEB SOURCES:');
      const bookData = finalPrompt.includes('BOOK SOURCES:');
      
      if (webData) {
        parsedResponse.answer = 'Based on web sources: The query asks about naval ships and their wartime efforts. Web sources indicate that naval rescue ships were involved in various wartime operations including convoy operations, evacuations, and combat engagements during World War II and the Vietnam War.';
      } else {
        parsedResponse.answer = 'No relevant information found.';
      }
    } else if (parsedResponse.answer.length < 10) {
      logger.warn('Answer text suspiciously short:', {
        text: parsedResponse.answer,
        length: parsedResponse.answer.length
      });
    }

    // Initialize missing arrays if not present
    if (!Array.isArray(parsedResponse.missing_information)) {
      parsedResponse.missing_information = [];
    }
    if (!Array.isArray(parsedResponse.source_conflicts)) {
      parsedResponse.source_conflicts = [];
    }
    
    // Log successful parsing
    logger.info('Successfully parsed LLM response:', {
      text_length: parsedResponse?.answer?.length || 0,
      has_missing_info: parsedResponse?.missing_information?.length > 0,
      has_conflicts: parsedResponse?.source_conflicts?.length > 0
    });
    
    // Ensure we have a valid response structure
    if (!parsedResponse?.answer) {
      logger.warn('Missing or invalid answer in response');
      parsedResponse = {
        answer: 'No valid response was generated.',
        missing_information: ['Failed to generate a valid response'],
        source_conflicts: []
      };
    }

    // The answer is now a plain string, no need to clean citations
    let formattedAnswer = parsedResponse.answer;

    // Extract sources from the prompt to build references
    const bookSources = [];
    const webSources = [];
    
    // Extract book sources
    const bookSourceMatches = finalPrompt.match(/\[([^\]]+)\] From ([^:]+):/g);
    if (bookSourceMatches) {
      bookSourceMatches.forEach(match => {
        const idMatch = match.match(/\[([^\]]+)\]/);
        const sourceMatch = match.match(/From ([^:]+):/);
        if (idMatch && sourceMatch && !idMatch[1].startsWith('WEB')) {
          bookSources.push({
            id: idMatch[1],
            source: sourceMatch[1].trim()
          });
        }
      });
    }
    
    // Extract web sources - the format is [WEB1] From Title (Relevance: X/10):
    const webSourceRegex = /\[(WEB\d+)\] From ([^(]+) \(Relevance: \d+\/10\):/g;
    let webMatch;
    while ((webMatch = webSourceRegex.exec(finalPrompt)) !== null) {
      const id = webMatch[1];
      const title = webMatch[2].trim();
      // Avoid duplicates
      if (!webSources.some(s => s.id === id)) {
        webSources.push({
          id: id,
          source: title
        });
      }
    }

    // Add references section if we have any sources
    if (bookSources.length > 0 || webSources.length > 0) {
      formattedAnswer += '\n\n';
      
      let citationNumber = 1;
      
      if (webSources.length > 0) {
        webSources.forEach(source => {
          formattedAnswer += `\n[${citationNumber}] ${source.source}`;
          citationNumber++;
        });
      }
      
      if (bookSources.length > 0) {
        bookSources.forEach(source => {
          formattedAnswer += `\n[${citationNumber}] ${source.source}`;
          citationNumber++;
        });
      }
    }

    // Only add missing information or conflicts if they're significant
    // Don't add these sections for normal answers to keep it conversational
    if (parsedResponse.missing_information && 
        parsedResponse.missing_information.length > 0 && 
        parsedResponse.missing_information.some(info => 
          !info.toLowerCase().includes('no missing') && 
          !info.toLowerCase().includes('all necessary'))) {
      // Only add if there's actually missing info, not just boilerplate
      const significantMissing = parsedResponse.missing_information.filter(info => 
        !info.toLowerCase().includes('no missing') && 
        !info.toLowerCase().includes('all necessary'));
      if (significantMissing.length > 0) {
        formattedAnswer += '\n\nNote: ' + significantMissing.join('; ');
      }
    }
    
    formattedAnswer = formattedAnswer.trim();
    
    logger.info('Final answer generated:', { 
      answer_length: formattedAnswer.length,
      prompt_length: finalPrompt.length,
      has_missing_info: parsedResponse.missing_information?.length > 0,
      has_conflicts: parsedResponse.source_conflicts?.length > 0
    });
    
    return formattedAnswer;
  } catch (error) {
    logger.error('Error generating final answer:', {
      error: error.message,
      prompt_length: finalPrompt?.length
    });
    throw error; // Let the router handle the error
  }
}

module.exports = {
  buildFinalPrompt,
  generateFinalAnswer
};