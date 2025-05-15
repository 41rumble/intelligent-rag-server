const { OpenAI } = require('openai');
const logger = require('../utils/logger');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    
    RELEVANT KNOWLEDGE:
    ${compressedKnowledge.compressed_text}
    
    KEY POINTS:
    ${compressedKnowledge.key_points.map(point => `- ${point}`).join('\n')}
    `;
    
    // Add web search information if available
    if (webSummary && webSummary.summary) {
      context += `
      
      ADDITIONAL INFORMATION FROM WEB SEARCH:
      ${webSummary.summary}
      
      ADDITIONAL FACTS:
      ${webSummary.facts.map(fact => `- ${fact}`).join('\n')}
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
    3. Factually accurate and based on the provided information
    4. Written in a natural, engaging style
    5. Include citations to sources when appropriate
    
    ${context}
    
    Provide a thoughtful, well-reasoned response to the query.
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
    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL,
      messages: [{ role: 'user', content: finalPrompt }],
      temperature: 0.7,
      max_tokens: 2000
    });

    const answer = response.choices[0].message.content;
    
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