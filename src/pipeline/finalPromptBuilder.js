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
    You are an intelligent assistant specializing in comprehensive research and analysis. Answer the following query based on the provided context. Your response should be:
    
    1. Comprehensive and directly address the query
    2. Well-structured with clear organization
    3. Factually accurate and based ONLY on the provided information
    4. Written in a natural, engaging style
    5. Include citations to sources using [source_id] format
    
    IMPORTANT GUIDELINES:
    - If book sources lack relevant information, focus on reliable web sources
    - For factual queries, prioritize specific details and verified information
    - When combining book and web sources, cross-reference and verify information
    - If sources conflict, explain the discrepancies
    - If key information is missing, acknowledge this in the response
    
    CITATION RULES:
    - Every fact must have a citation in [brackets]
    - Use [source_id] format, e.g. [bio_12], [chapter_3], [WEB1]
    - Multiple sources can be combined like [bio_12][WEB2]
    - Citations go at the end of the sentence containing the fact
    - End with a "Sources:" section listing all cited sources and their relevance
    
    Example format:
    "The HMS Victory was launched in 1765 [WEB1] and served as Lord Nelson's flagship at the Battle of Trafalgar [WEB2]. After years of active service, she was moved to dry dock in Portsmouth in 1922 [WEB3][bio_4] where she remains today as a museum ship."
    
    Sources:
    [WEB1] Naval History Database - Primary source for launch date
    [WEB2] Battle Records - Details of Trafalgar engagement
    [WEB3] Preservation Records - Documentation of dry dock transfer
    [bio_4] Ship's historical record - Corroborating evidence
    
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
    const answer = await generateCompletion(finalPrompt, {
      temperature: 0.5, // Lower temperature for more focused answers
      maxTokens: 1500,  // Slightly shorter but more concise answers
      presencePenalty: 0.5, // Encourage diversity in response
      frequencyPenalty: 0.3 // Reduce repetition
    });
    
    // Validate the answer
    if (!answer || answer.trim().length === 0) {
      throw new Error('Empty or invalid answer generated');
    }
    
    logger.info('Final answer generated:', { 
      answer_length: answer.length,
      prompt_length: finalPrompt.length
    });
    
    return answer.trim();
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