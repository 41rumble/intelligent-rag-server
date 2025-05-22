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
    // Base context
    let context = `
    QUERY: "${queryInfo.original_query}"
    
    PROJECT: "${queryInfo.project_id}"
    
    QUERY TYPE: ${queryInfo.query_type || 'General'}
    
    RELEVANT SOURCES:
    ${compressedKnowledge.source_snippets.map(snippet => 
      `[${snippet.id}] From ${snippet.source}:
      "${snippet.text}"`
    ).join('\n\n')}
    
    KEY POINTS:
    ${compressedKnowledge.key_points.map((point, i) => `[KP${i+1}] ${point}`).join('\n')}
    `;
    
    // Add web search information if available
    if (webSummary && webSummary.summary) {
      context += `
      
      ADDITIONAL WEB SOURCES:
      ${webSummary.source_urls.map((url, i) => 
        `[WEB${i+1}] From ${url}:
        "${webSummary.summaries[i]}"`
      ).join('\n\n')}
      
      ADDITIONAL FACTS:
      ${webSummary.facts.map((fact, i) => `[WEB${i+1}] ${fact}`).join('\n')}
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
    You are an intelligent assistant specializing in literature and historical analysis. Answer the following query based on the provided context. Your response should be:
    
    1. Comprehensive and directly address the query
    2. Well-structured with clear organization
    3. Factually accurate and based ONLY on the provided information
    4. Written in a natural, engaging style
    5. Include citations to sources using [source_id] format
    
    CITATION RULES:
    - Every fact must have a citation in [brackets]
    - Use [source_id] format, e.g. [bio_12] or [chapter_3]
    - Multiple sources can be combined like [bio_12][chapter_3]
    - Citations go at the end of the sentence containing the fact
    - End with a "Sources:" section listing all cited sources
    
    Example format:
    "Asa Jennings arrived in Smyrna in August 1922 [bio_12]. During the Great Fire, he worked with both Greek and Turkish authorities [chapter_3][web_2] to coordinate evacuation efforts."
    
    Sources:
    [bio_12] Character biography
    [chapter_3] Chapter excerpt
    [web_2] Historical article
    
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
    const answer = await generateCompletion(finalPrompt, {
      temperature: 0.7,
      maxTokens: 2000
    });
    
    logger.info('Final answer generated:', { 
      answer_length: answer.length
    });
    
    return answer;
  } catch (error) {
    logger.error('Error generating final answer:', error);
    return 'I apologize, but I encountered an error while generating an answer to your query. Please try again or rephrase your question.';
  }
}

module.exports = {
  buildFinalPrompt,
  generateFinalAnswer
};