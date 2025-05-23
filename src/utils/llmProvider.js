const { OpenAI } = require('openai');
const { Ollama } = require('ollama');
const axios = require('axios');
const logger = require('./logger');
require('dotenv').config();

// LLM provider configuration
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
const OPENAI_LLM_MODEL = process.env.LLM_MODEL || 'gpt-4-1106-preview';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const OLLAMA_LLM_MODEL = process.env.OLLAMA_LLM_MODEL || 'llama3';

// Initialize clients
let openaiClient;
let ollamaClient;

if (LLM_PROVIDER === 'openai') {
  if (!OPENAI_API_KEY) {
    logger.error('OpenAI API key is required when using OpenAI provider');
    process.exit(1);
  }
  
  openaiClient = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
  
  logger.info('OpenAI client initialized');
} else if (LLM_PROVIDER === 'ollama') {
  // Create Ollama client with custom host
  ollamaClient = new Ollama({ host: OLLAMA_BASE_URL });
  
  logger.info('Ollama client initialized with host: ' + OLLAMA_BASE_URL);
} else {
  logger.error(`Unsupported LLM provider: ${LLM_PROVIDER}`);
  process.exit(1);
}

/**
 * Generate embeddings for text
 * @param {string} text - Text to embed
 * @returns {Promise<Array>} Embedding vector
 */
async function generateEmbedding(text) {
  try {
    let embedding;
    
    logger.debug(`Generating embedding for text (${text.length} chars) using ${LLM_PROVIDER}`);
    
    if (LLM_PROVIDER === 'openai') {
      const response = await openaiClient.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: text,
      });
      
      embedding = response.data[0].embedding;
      logger.debug(`OpenAI embedding generated: ${embedding.length} dimensions`);
    } else if (LLM_PROVIDER === 'ollama') {
      // Use direct API call to Ollama for embeddings
      const response = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
        model: OLLAMA_EMBEDDING_MODEL,
        prompt: text
      });
      
      if (!response.data || !response.data.embedding) {
        throw new Error('Invalid response from Ollama embedding API');
      }
      
      embedding = response.data.embedding;
      logger.debug(`Ollama embedding generated: ${embedding ? embedding.length : 'null'} dimensions`);
    }
    
    // Validate embedding format
    if (!embedding) {
      throw new Error('Embedding is null or undefined');
    }
    
    if (!Array.isArray(embedding)) {
      logger.error('Invalid embedding type:', typeof embedding);
      logger.error('Embedding value:', embedding);
      throw new Error('Embedding must be an array');
    }
    
    // Convert to array of numbers if needed
    embedding = embedding.map(Number);
    
    // Validate dimensions based on provider
    const expectedDimensions = LLM_PROVIDER === 'openai' ? 1536 : 768;
    if (embedding.length !== expectedDimensions) {
      throw new Error(`Invalid embedding dimensions: got ${embedding.length}, expected ${expectedDimensions}`);
    }
    
    // Validate all values are numbers
    if (!embedding.every(x => typeof x === 'number' && !isNaN(x))) {
      throw new Error('Embedding contains non-numeric values');
    }
    return embedding;
  } catch (error) {
    logger.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate text completion using the configured LLM
 * @param {string} prompt - Prompt text
 * @param {Object} options - Additional options
 * @returns {Promise<string>} Generated text
 */
async function generateCompletion(prompt, options = {}) {
  try {
    const {
      temperature = 0.7,
      maxTokens = 2000,
      responseFormat = null,
      systemPrompt = null
    } = options;
    
    if (LLM_PROVIDER === 'openai') {
      const messages = [];
      
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      
      messages.push({ role: 'user', content: prompt });
      
      const requestOptions = {
        model: OPENAI_LLM_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens
      };
      
      if (responseFormat) {
        requestOptions.response_format = { type: responseFormat };
      }
      
      const response = await openaiClient.chat.completions.create(requestOptions);
      
      return response.choices[0].message.content;
    } else if (LLM_PROVIDER === 'ollama') {
      const messages = [];
      
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      
      messages.push({ role: 'user', content: prompt });
      
      // For Ollama, we need to handle streaming to get complete responses
      let fullResponse = '';
      const stream = await ollamaClient.chat({
        model: OLLAMA_LLM_MODEL,
        messages,
        options: {
          temperature,
          num_predict: maxTokens
        },
        stream: true
      });

      for await (const part of stream) {
        if (part.message?.content) {
          fullResponse += part.message.content;
        }
      }

      return fullResponse;
    }
  } catch (error) {
    logger.error('Error generating completion:', error);
    throw error;
  }
}

/**
 * Generate structured JSON response using the configured LLM
 * @param {string} prompt - Prompt text
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Generated JSON object
 */
/**
 * Extract JSON from a string that might contain other text
 * @param {string} text - Text that might contain JSON
 * @returns {string|null} Extracted JSON string or null if not found
 */
function extractJsonString(text) {
  // Try to find JSON between curly braces (for objects)
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      JSON.parse(objMatch[0]); // Validate it's valid JSON
      return objMatch[0];
    } catch (e) {
      // If parse fails, it might be a partial match. Continue to next attempt.
    }
  }
  
  // Try to find JSON between square brackets (for arrays)
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      JSON.parse(arrayMatch[0]); // Validate it's valid JSON
      return arrayMatch[0];
    } catch (e) {
      // If parse fails, continue to next attempt
    }
  }
  
  return null;
}

async function generateStructuredResponse(prompt, options = {}) {
  if (LLM_PROVIDER === 'openai') {
    // OpenAI supports JSON response format natively
    const response = await generateCompletion(prompt, {
      ...options,
      responseFormat: 'json_object',
      systemPrompt: "You are a helpful assistant that always responds with valid JSON. Never include any explanatory text outside the JSON structure."
    });
    
    try {
      return JSON.parse(response);
    } catch (error) {
      logger.error('Failed to parse OpenAI response as JSON:', {
        error: error.message,
        response_preview: response.substring(0, 100)
      });
      throw new Error('Invalid JSON response from OpenAI');
    }
  } else if (LLM_PROVIDER === 'ollama') {
    // For Ollama, we need to explicitly request JSON in the prompt
    const jsonPrompt = `You are a JSON-only assistant. You must respond with ONLY valid JSON.

CRITICAL REQUIREMENTS:
1. Response must be ONLY valid JSON
2. Start with { and end with }
3. NO text before or after the JSON
4. NO markdown code blocks
5. NO explanations or comments
6. Keep the response concise and focused
7. If the response would be too long, focus on the most relevant information

TASK:
${prompt}

Remember: ONLY the JSON object, nothing else.`;

    // Add system prompt if not provided
    if (!options.systemPrompt) {
      options.systemPrompt = "You are a JSON-only assistant that always responds with valid JSON. Never include any text outside the JSON structure.";
    }
    
    const response = await generateCompletion(jsonPrompt, {
      ...options,
      temperature: options.temperature || 0.1, // Very low temperature for structured output
      maxTokens: Math.min(options.maxTokens || 2000, 4000) // Ensure reasonable token limit
    });
    
    // Clean the response and handle potential truncation
    let cleanedResponse = response
      .trim()
      .replace(/^[\s\n]*```[^\n]*\n/, '')  // Remove opening code fence
      .replace(/\n```[\s\n]*$/, '')         // Remove closing code fence
      .trim();
      
    // If response appears truncated, try to find complete JSON
    if (cleanedResponse.split('{').length !== cleanedResponse.split('}').length) {
      logger.warn('Response appears truncated, attempting to extract complete JSON');
      const extracted = extractJsonString(cleanedResponse);
      if (extracted) {
        cleanedResponse = extracted;
      } else {
        logger.error('Could not find complete JSON in truncated response');
        throw new Error('Incomplete JSON response from Ollama');
      }
    }
    
    try {
      return JSON.parse(cleanedResponse);
    } catch (error) {
      logger.error('Failed to parse Ollama response as JSON:', {
        error: error.message,
        response_preview: cleanedResponse.substring(0, 100)
      });
      throw new Error('Invalid JSON response from Ollama');
    }
  }
}

module.exports = {
  generateEmbedding,
  generateCompletion,
  generateStructuredResponse,
  LLM_PROVIDER
};