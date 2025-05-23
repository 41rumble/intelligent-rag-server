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

    // Log what we're working with
    logger.info('Building final prompt with:', {
      query: queryInfo.original_query,
      compressed_length: compressedKnowledge.compressed_text.length,
      snippets: compressedKnowledge.source_snippets.length,
      key_points: compressedKnowledge.key_points.length,
      has_web: !!webSummary?.summary
    });

    // Determine if RAG has relevant information
    const hasRelevantRAG = compressedKnowledge.source_snippets.some(s => 
      s.relevance && (
        s.relevance.toLowerCase().includes('high') || 
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
      (compressedKnowledge.source_snippets.length > 0 ? `
        BOOK SOURCES:
        ${compressedKnowledge.source_snippets.map(snippet => 
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
          (isWebFocused ? true : fact.relevance.toLowerCase().includes('high'))) || [];
      
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
    - NO "Sources:" or other headings
    - NO markdown formatting
    - ONLY the JSON object described below
    
    REQUIRED: Your response must start with "{" and end with "}" and be a valid JSON object with this EXACT structure:
    {
      "answer": {
        "text": "Your answer text here with citations like [WEB1] or [bio_2]",
        "citations": [
          {
            "id": "source_id",
            "source": "source name/title",
            "relevance": "brief explanation of source relevance"
          }
        ]
      },
      "source_analysis": {
        "book_sources_used": true,
        "web_sources_used": true,
        "missing_information": [],
        "source_conflicts": []
      }
    }

    IMPORTANT JSON FORMATTING RULES:
    1. Use double quotes (") for all strings
    2. No trailing commas
    3. Boolean values must be true or false (no quotes)
    4. Arrays can be empty [] but must be present
    5. No comments in the JSON

    CITATION REQUIREMENTS:
    1. Every factual statement must have a citation in the citations array
    2. Citations in the text should use [source_id] format
    3. Multiple sources use format: [WEB1][bio_2]
    4. Each citation must reference a source from the provided context
    5. The citations array must include ALL sources used, with explanations
    
    Note: The citations will be removed from the displayed answer text,
    but are required to track which facts came from which sources.

    CRITICAL: Your response must be EXACTLY like this example, but with your content:
    {
      "answer": {
        "text": "The Great Fire of Smyrna began in September 1922 [doc_1]. The fire started in the Armenian quarter [web_1] and quickly spread through the city's narrow streets [doc_2]. Strong winds and dry conditions helped the fire spread rapidly [web_2][doc_1], leading to widespread destruction.",
        "citations": [
          {
            "id": "doc_1",
            "source": "The Great Fire - Chapter 2",
            "relevance": "Primary source for fire timeline and conditions"
          },
          {
            "id": "web_1",
            "source": "Historical Archives",
            "relevance": "Details about fire's origin point"
          },
          {
            "id": "doc_2",
            "source": "City Maps and Records",
            "relevance": "Information about city layout"
          },
          {
            "id": "web_2",
            "source": "Weather Records",
            "relevance": "Confirmation of weather conditions"
          }
        ]
      },
      "source_analysis": {
        "book_sources_used": true,
        "web_sources_used": true,
        "missing_information": [],
        "source_conflicts": []
      }
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
      temperature: 0.3, // Even lower temperature for more focused answers
      maxTokens: 2000,  // Allow more space for citations and analysis
      systemPrompt: "You are a JSON-only assistant that focuses on direct answers with citations."
    });

    // Validate and normalize the response structure
    if (!parsedResponse || typeof parsedResponse !== 'object') {
      logger.error('Invalid response format:', { response: parsedResponse });
      throw new Error('Invalid response format from LLM');
    }

    // Log raw response for debugging
    logger.info('Raw LLM response:', {
      has_answer: !!parsedResponse.answer,
      has_text: !!parsedResponse.answer?.text,
      has_citations: Array.isArray(parsedResponse.answer?.citations),
      citations_count: parsedResponse.answer?.citations?.length || 0
    });

    // Initialize and validate answer structure
    if (!parsedResponse.answer || typeof parsedResponse.answer !== 'object') {
      logger.warn('Missing answer object, initializing empty');
      parsedResponse.answer = {};
    }

    // Validate answer text
    if (!parsedResponse.answer.text || typeof parsedResponse.answer.text !== 'string') {
      logger.warn('Invalid or missing answer text');
      parsedResponse.answer.text = 'No relevant information found.';
    } else if (parsedResponse.answer.text.length < 10) {
      logger.warn('Answer text suspiciously short:', {
        text: parsedResponse.answer.text,
        length: parsedResponse.answer.text.length
      });
    }

    // Validate citations
    if (!Array.isArray(parsedResponse.answer.citations)) {
      logger.warn('Invalid citations format, initializing empty array');
      parsedResponse.answer.citations = [];
    } else {
      // Filter out invalid citations
      parsedResponse.answer.citations = parsedResponse.answer.citations.filter(citation => {
        const isValid = citation && 
                       typeof citation === 'object' &&
                       typeof citation.id === 'string' &&
                       typeof citation.source === 'string';
        if (!isValid) {
          logger.warn('Removing invalid citation:', { citation });
        }
        return isValid;
      });
    }

    // Initialize and validate source analysis
    parsedResponse.source_analysis = {
      book_sources_used: false,
      web_sources_used: false,
      missing_information: [],
      source_conflicts: [],
      ...parsedResponse.source_analysis
    };

    // Ensure correct types for source analysis fields
    parsedResponse.source_analysis.book_sources_used = 
      !!parsedResponse.source_analysis.book_sources_used;
    parsedResponse.source_analysis.web_sources_used = 
      !!parsedResponse.source_analysis.web_sources_used;
    parsedResponse.source_analysis.missing_information = 
      Array.isArray(parsedResponse.source_analysis.missing_information) ? 
      parsedResponse.source_analysis.missing_information.filter(x => typeof x === 'string') : [];
    parsedResponse.source_analysis.source_conflicts = 
      Array.isArray(parsedResponse.source_analysis.source_conflicts) ? 
      parsedResponse.source_analysis.source_conflicts.filter(x => typeof x === 'string') : [];

    // Verify citations match the text
    const citationsInText = (parsedResponse.answer.text.match(/\[\w+\d*\]/g) || [])
      .map(c => c.slice(1, -1));
    const citationIds = parsedResponse.answer.citations.map(c => c.id);
    
    const missingCitations = citationsInText.filter(id => !citationIds.includes(id));
    const unusedCitations = citationIds.filter(id => !citationsInText.includes(id));
    
    if (missingCitations.length > 0 || unusedCitations.length > 0) {
      logger.warn('Citation mismatch:', {
        missing_citations: missingCitations,
        unused_citations: unusedCitations
      });
    }
    
    // Log successful parsing
    logger.info('Successfully parsed LLM response:', {
      text_length: parsedResponse?.answer?.text?.length || 0,
      citations_count: parsedResponse?.answer?.citations?.length || 0,
      has_missing_info: parsedResponse?.source_analysis?.missing_information?.length > 0,
      has_conflicts: parsedResponse?.source_analysis?.source_conflicts?.length > 0
    });
    
    // Ensure we have a valid response structure
    if (!parsedResponse?.answer?.text) {
      logger.warn('Missing or invalid answer text in response');
      parsedResponse = {
        answer: {
          text: 'No valid response was generated.',
          citations: []
        },
        source_analysis: {
          book_sources_used: false,
          web_sources_used: false,
          missing_information: ['Failed to generate a valid response'],
          source_conflicts: []
        }
      };
    }

    // Clean up the answer text while preserving citations
    const cleanAnswer = parsedResponse.answer.text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\[\s+/g, '[')  // Remove space after [
      .replace(/\s+\]/g, ']')  // Remove space before ]
      .replace(/\]\s*\[/g, '][')  // Combine adjacent citations
      .trim();
    
    // Group citations by source type
    const webCitations = parsedResponse.answer.citations
      .filter(c => c.id.startsWith('WEB'));
    const bookCitations = parsedResponse.answer.citations
      .filter(c => !c.id.startsWith('WEB'));
    
    // Format the final answer
    let formattedAnswer = cleanAnswer;

    // Add references section if we have any
    if (parsedResponse.answer.citations.length > 0) {
      formattedAnswer += '\n\nReferences:';
      
      // Add web references first for web-focused queries
      if (webCitations.length > 0) {
        formattedAnswer += '\nWeb Sources:';
        formattedAnswer += '\n' + webCitations
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(citation => `[${citation.id}] ${citation.source}${citation.relevance ? ` - ${citation.relevance}` : ''}`)
          .join('\n');
      }
      
      // Add book references
      if (bookCitations.length > 0) {
        formattedAnswer += '\nBook Sources:';
        formattedAnswer += '\n' + bookCitations
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(citation => `[${citation.id}] ${citation.source}${citation.relevance ? ` - ${citation.relevance}` : ''}`)
          .join('\n');
      }
    }

    // Add missing information if any
    if (parsedResponse.source_analysis.missing_information.length > 0) {
      formattedAnswer += '\n\nMissing Information:';
      formattedAnswer += '\n' + parsedResponse.source_analysis.missing_information
        .map(info => `- ${info}`)
        .join('\n');
    }

    // Add source conflicts if any
    if (parsedResponse.source_analysis.source_conflicts.length > 0) {
      formattedAnswer += '\n\nSource Conflicts:';
      formattedAnswer += '\n' + parsedResponse.source_analysis.source_conflicts
        .map(conflict => `- ${conflict}`)
        .join('\n');
    }

    // Add source analysis
    formattedAnswer += '\n\nSource Analysis:';
    formattedAnswer += `\n- Book sources ${parsedResponse.source_analysis.book_sources_used ? 'were' : 'were not'} used`;
    formattedAnswer += `\n- Web sources ${parsedResponse.source_analysis.web_sources_used ? 'were' : 'were not'} used`;
    
    formattedAnswer = formattedAnswer.trim();
    
    logger.info('Final answer generated:', { 
      answer_length: formattedAnswer.length,
      prompt_length: finalPrompt.length,
      citations_count: parsedResponse.answer.citations.length,
      has_missing_info: parsedResponse.source_analysis.missing_information.length > 0,
      has_conflicts: parsedResponse.source_analysis.source_conflicts.length > 0
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