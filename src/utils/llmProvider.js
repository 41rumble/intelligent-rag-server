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
    if (LLM_PROVIDER === 'openai') {
      const response = await openaiClient.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: text,
      });
      
      return response.data[0].embedding;
    } else if (LLM_PROVIDER === 'ollama') {
      // Use Ollama client for embeddings
      const response = await ollamaClient.embed({
        model: OLLAMA_EMBEDDING_MODEL,
        input: text
      });
      
      return response.embedding;
    }
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
      
      const response = await ollamaClient.chat({
        model: OLLAMA_LLM_MODEL,
        messages,
        options: {
          temperature,
          num_predict: maxTokens
        }
      });
      
      return response.message.content;
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
async function generateStructuredResponse(prompt, options = {}) {
  try {
    if (LLM_PROVIDER === 'openai') {
      // OpenAI supports JSON response format natively
      const response = await generateCompletion(prompt, {
        ...options,
        responseFormat: 'json_object'
      });
      
      return JSON.parse(response);
    } else if (LLM_PROVIDER === 'ollama') {
      // For Ollama, we need to explicitly request JSON in the prompt
      const jsonPrompt = `${prompt}\n\nRespond with valid JSON only, no other text.`;
      
      // Add system prompt if not provided
      if (!options.systemPrompt) {
        options.systemPrompt = "You are a helpful assistant that always responds with valid JSON. Never include any explanatory text outside the JSON structure.";
      }
      
      const response = await generateCompletion(jsonPrompt, options);
      
      // Extract JSON from response (in case there's any extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse JSON from response');
      }
    }
  } catch (error) {
    logger.error('Error generating structured response:', error);
    throw error;
  }
}

module.exports = {
  generateEmbedding,
  generateCompletion,
  generateStructuredResponse,
  LLM_PROVIDER
};