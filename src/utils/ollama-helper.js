const logger = require('./logger');

/**
 * Call Ollama model with retry logic and error handling
 * @param {string} model - Model name (e.g., 'llama2', 'mistral')
 * @param {string} prompt - Prompt to send to model
 * @param {Object} options - Additional options
 * @returns {Promise<string>} Model response
 */
async function callOllama(model, prompt, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          ...options
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      lastError = error;
      logger.warn(`Ollama call attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw new Error(`Failed to call Ollama after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Extract structured information from text using Ollama
 * @param {string} model - Model name
 * @param {string} text - Text to analyze
 * @param {string} schema - JSON schema for expected output
 * @returns {Promise<Object>} Structured data
 */
async function extractStructured(model, text, schema) {
  const prompt = `
Please analyze the following text and extract information according to this JSON schema:
${schema}

Text to analyze:
${text}

Return ONLY valid JSON matching the schema, no other text.`;

  try {
    const response = await callOllama(model, prompt);
    return JSON.parse(response);
  } catch (error) {
    logger.error(`Failed to extract structured data: ${error.message}`);
    throw error;
  }
}

/**
 * Analyze relationship between two characters in a text
 * @param {string} model - Model name
 * @param {string} text - Text containing interaction
 * @param {string} char1 - First character name
 * @param {string} char2 - Second character name
 * @returns {Promise<Object>} Relationship analysis
 */
async function analyzeRelationship(model, text, char1, char2) {
  const schema = {
    type: "object",
    properties: {
      interaction_type: {
        type: "string",
        enum: ["friendly", "hostile", "professional", "romantic", "familial", "neutral", "complex"]
      },
      sentiment: {
        type: "number",
        description: "Score from -1 (very negative) to 1 (very positive)"
      },
      power_dynamic: {
        type: "string",
        enum: ["equal", "char1_dominant", "char2_dominant", "unclear"]
      },
      key_observations: {
        type: "array",
        items: { type: "string" }
      },
      confidence: {
        type: "number",
        description: "Confidence in analysis from 0 to 1"
      }
    },
    required: ["interaction_type", "sentiment", "power_dynamic", "key_observations", "confidence"]
  };

  const prompt = `
Analyze the relationship between ${char1} and ${char2} in this text:
${text}

Consider:
1. Type of interaction (friendly, hostile, etc.)
2. Emotional sentiment
3. Power dynamics between them
4. Key observations about their relationship
5. How confident you are in this analysis

Return analysis in JSON format.`;

  return await extractStructured(model, prompt, JSON.stringify(schema));
}

/**
 * Extract themes and motifs from text
 * @param {string} model - Model name
 * @param {string} text - Text to analyze
 * @returns {Promise<Object>} Theme analysis
 */
async function extractThemes(model, text) {
  const schema = {
    type: "object",
    properties: {
      major_themes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            evidence: { type: "array", items: { type: "string" } }
          }
        }
      },
      motifs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            meaning: { type: "string" },
            occurrences: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  };

  return await extractStructured(model, text, JSON.stringify(schema));
}

/**
 * Analyze character development in a text
 * @param {string} model - Model name
 * @param {string} text - Text to analyze
 * @param {string} character - Character name
 * @returns {Promise<Object>} Character development analysis
 */
async function analyzeCharacterDevelopment(model, text, character) {
  const schema = {
    type: "object",
    properties: {
      arc_type: {
        type: "string",
        enum: ["positive", "negative", "flat", "circular", "complex"]
      },
      key_moments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            impact: { type: "string" },
            evidence: { type: "string" }
          }
        }
      },
      character_traits: {
        type: "object",
        properties: {
          initial: { type: "array", items: { type: "string" } },
          developed: { type: "array", items: { type: "string" } }
        }
      }
    }
  };

  return await extractStructured(model, text, JSON.stringify(schema));
}

/**
 * Identify significant events in text
 * @param {string} model - Model name
 * @param {string} text - Text to analyze
 * @returns {Promise<Array>} List of significant events
 */
async function identifyEvents(model, text) {
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        significance: {
          type: "object",
          properties: {
            level: { type: "string", enum: ["high", "medium", "low"] },
            reason: { type: "string" }
          }
        },
        characters_involved: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" }
            }
          }
        }
      }
    }
  };

  return await extractStructured(model, text, JSON.stringify(schema));
}

/**
 * Analyze social dynamics in a group
 * @param {string} model - Model name
 * @param {string} text - Text to analyze
 * @param {Array<string>} characters - List of character names
 * @returns {Promise<Object>} Social dynamics analysis
 */
async function analyzeSocialDynamics(model, text, characters) {
  const schema = {
    type: "object",
    properties: {
      group_type: {
        type: "string",
        enum: ["family", "friends", "allies", "rivals", "mixed", "other"]
      },
      power_structure: {
        type: "object",
        properties: {
          leaders: { type: "array", items: { type: "string" } },
          followers: { type: "array", items: { type: "string" } },
          independent: { type: "array", items: { type: "string" } }
        }
      },
      subgroups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            members: { type: "array", items: { type: "string" } },
            bond_type: { type: "string" }
          }
        }
      },
      tensions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            parties: { type: "array", items: { type: "string" } },
            cause: { type: "string" }
          }
        }
      }
    }
  };

  return await extractStructured(model, text, JSON.stringify(schema));
}

module.exports = {
  callOllama,
  extractStructured,
  analyzeRelationship,
  extractThemes,
  analyzeCharacterDevelopment,
  identifyEvents,
  analyzeSocialDynamics
};