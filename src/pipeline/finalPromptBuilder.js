const logger = require('../utils/logger');
const { generateCompletion } = require('../utils/llmProvider');
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
    // Validate required inputs
    if (!queryInfo || !compressedKnowledge || !compressedKnowledge.compressed_text) {
      throw new Error('Missing required context for prompt building');
    }

    // Determine if RAG has relevant information
    const hasRelevantRAG = compressedKnowledge.source_snippets.some(s => 
      s.relevance && s.relevance.toLowerCase().includes('high'));
    
    // Base context with more structured information
    let context = `
    QUERY INFORMATION:
    - Original Query: "${queryInfo.original_query}"
    - Project ID: "${queryInfo.project_id}"
    - Query Type: ${queryInfo.query_type || 'General'}
    - Query Focus: ${queryInfo.focus || 'Not specified'}
    
    ${hasRelevantRAG ? `
    RELEVANT BOOK SOURCES:
    ${compressedKnowledge.source_snippets.map(snippet => 
      `[${snippet.id}] From ${snippet.source}:
      "${snippet.text}"
      Relevance: ${snippet.relevance}`
    ).join('\n\n')}
    
    KEY POINTS FROM BOOKS:
    ${compressedKnowledge.key_points.map((point, i) => `[KP${i+1}] ${point}`).join('\n')}
    ` : `
    NOTE: No highly relevant information found in the book sources for this query.
    The answer will primarily rely on web sources and general knowledge.
    `}
    `;
    
    // Add web search information if available and relevant
    if (webSummary && webSummary.summary) {
      // Log web information being used in final prompt
      logger.info('Using web information in final prompt:', {
        summary: webSummary.summary,
        facts: webSummary.facts,
        sources: webSummary.source_urls,
        relevance_analysis: webSummary.relevance_analysis
      });
      
      context += `
      
      RELEVANT WEB SOURCES:
      ${webSummary.relevance_analysis}
      
      HIGHLY RELEVANT WEB INFORMATION:
      ${webSummary.source_urls
        .filter(url => url.relevance_score >= 7) // Only include highly relevant sources
        .map((url, i) => 
          `[${url.id}] From ${url.title} (Relevance: ${url.relevance_score}/10):
          "${webSummary.facts.find(f => f.sources.includes(i+1))?.text || ''}"
          Relevance: ${webSummary.facts.find(f => f.sources.includes(i+1))?.relevance || ''}`
        ).join('\n\n')}
      
      SUPPORTING WEB FACTS:
      ${webSummary.facts
        .filter(fact => fact.relevance) // Only include facts with explicit relevance
        .map(fact => 
          `[${fact.sources.map(s => `WEB${s}`).join('][')}] ${fact.text}
          Why relevant: ${fact.relevance}`
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
    You are an intelligent assistant specializing in comprehensive research and analysis. Answer the following query based on the provided context.

    CRITICAL: YOU MUST RESPOND WITH VALID JSON ONLY. DO NOT INCLUDE ANY TEXT BEFORE OR AFTER THE JSON.
    
    Your response must be a single JSON object with this exact structure:
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
        "missing_information": [
          "list any key missing information"
        ],
        "source_conflicts": [
          "list any conflicts between sources"
        ]
      }
    }

    IMPORTANT JSON FORMATTING RULES:
    1. Use double quotes (") for all strings
    2. No trailing commas
    3. Boolean values must be true or false (no quotes)
    4. Arrays can be empty [] but must be present
    5. No comments in the JSON

    CITATION REQUIREMENTS:
    1. Every factual statement must have a citation
    2. Citations must be in [brackets] and placed at the end of the relevant sentence
    3. Multiple sources use format: [WEB1][bio_2]
    4. All citations must be listed in the citations array
    5. Citations must match the source IDs from the provided context

    EXAMPLE RESPONSE:
    {
      "answer": {
        "text": "The HMS Victory was launched in 1765 [WEB1] and served as Lord Nelson's flagship at the Battle of Trafalgar [WEB2]. After years of active service, she was moved to dry dock in Portsmouth in 1922 [WEB3][bio_4] where she remains today as a museum ship.",
        "citations": [
          {
            "id": "WEB1",
            "source": "Naval History Database",
            "relevance": "Primary source for launch date"
          },
          {
            "id": "WEB2",
            "source": "Battle Records",
            "relevance": "Details of Trafalgar engagement"
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
    
    // Fallback prompt
    const fallbackPrompt = `
    Answer the following query based on your knowledge:
    
    QUERY: "${queryInfo.original_query}"
    
    Provide a thoughtful, well-reasoned response.
    `;
    
    return {
      prompt: fallbackPrompt,
      context: 'Error building context'
    };
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

    // Generate the answer with more focused parameters
    const response = await generateCompletion(finalPrompt, {
      temperature: 0.5, // Lower temperature for more focused answers
      maxTokens: 1500,  // Slightly shorter but more concise answers
      presencePenalty: 0.5, // Encourage diversity in response
      frequencyPenalty: 0.3 // Reduce repetition
    });
    
    // Clean and parse the response
    let parsedResponse;
    try {
      // Clean the response - remove any non-JSON content
      const jsonStart = response.indexOf('{');
      const jsonEnd = response.lastIndexOf('}') + 1;
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error('No JSON object found in response');
      }
      const cleanJson = response.slice(jsonStart, jsonEnd);
      
      // Try to parse the cleaned JSON
      parsedResponse = JSON.parse(cleanJson);
      
      // Validate the response structure
      if (!parsedResponse.answer?.text || !Array.isArray(parsedResponse.answer?.citations)) {
        throw new Error('Response missing required fields: answer.text or answer.citations');
      }
      
      if (!parsedResponse.source_analysis || 
          typeof parsedResponse.source_analysis.book_sources_used !== 'boolean' ||
          typeof parsedResponse.source_analysis.web_sources_used !== 'boolean' ||
          !Array.isArray(parsedResponse.source_analysis.missing_information) ||
          !Array.isArray(parsedResponse.source_analysis.source_conflicts)) {
        throw new Error('Response missing required source_analysis fields');
      }
      
      // Log successful parsing
      logger.info('Successfully parsed LLM response:', {
        text_length: parsedResponse.answer.text.length,
        citations_count: parsedResponse.answer.citations.length,
        has_missing_info: parsedResponse.source_analysis.missing_information.length > 0,
        has_conflicts: parsedResponse.source_analysis.source_conflicts.length > 0
      });
      
    } catch (parseError) {
      logger.error('Failed to parse LLM response:', {
        error: parseError.message,
        response_length: response.length,
        response_preview: response.slice(0, 200) + '...',
        stack: parseError.stack
      });
      
      // Attempt to salvage non-JSON response
      if (!parsedResponse) {
        return `${response.trim()}\n\nNote: Response formatting error - citations may not be properly structured.`;
      }
      throw parseError;
    }
    
    // Format the final answer with citations
    const formattedAnswer = `
${parsedResponse.answer.text}

Sources:
${parsedResponse.answer.citations.map(citation => 
  `[${citation.id}] ${citation.source} - ${citation.relevance}`
).join('\n')}

${parsedResponse.source_analysis.missing_information.length > 0 ? `
Missing Information:
${parsedResponse.source_analysis.missing_information.map(info => `- ${info}`).join('\n')}
` : ''}

${parsedResponse.source_analysis.source_conflicts.length > 0 ? `
Source Conflicts:
${parsedResponse.source_analysis.source_conflicts.map(conflict => `- ${conflict}`).join('\n')}
` : ''}
    `.trim();
    
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