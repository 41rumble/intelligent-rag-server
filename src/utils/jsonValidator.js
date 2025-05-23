const logger = require('./logger');

/**
 * Validate and clean a JSON response from the LLM
 * @param {string} response - Raw response from LLM
 * @param {Object} schema - Expected schema fields
 * @returns {Object} Parsed and validated JSON
 * @throws {Error} If validation fails
 */
function validateJsonResponse(response, schema = {}) {
  // First try to find JSON in the response
  const jsonStart = response.indexOf('{');
  const jsonEnd = response.lastIndexOf('}') + 1;
  
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    logger.error('No valid JSON structure found in response:', {
      response_length: response.length,
      response_preview: response.substring(0, 200)
    });
    throw new Error('Response must be valid JSON');
  }

  // Extract and parse JSON
  const jsonStr = response.slice(jsonStart, jsonEnd);
  let parsed;
  
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    logger.error('Failed to parse JSON:', {
      error: error.message,
      json_length: jsonStr.length,
      json_preview: jsonStr.substring(0, 200)
    });
    throw new Error('Invalid JSON structure');
  }

  // Validate required fields
  const { required = [], fields = {} } = schema;
  const missing = required.filter(field => !parsed[field]);
  
  if (missing.length > 0) {
    logger.error('Missing required fields:', {
      missing_fields: missing,
      parsed_fields: Object.keys(parsed)
    });
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  // Validate field types
  for (const [field, type] of Object.entries(fields)) {
    if (parsed[field] && typeof parsed[field] !== type) {
      logger.error('Invalid field type:', {
        field,
        expected: type,
        got: typeof parsed[field]
      });
      throw new Error(`Field ${field} must be of type ${type}`);
    }
  }

  return parsed;
}

module.exports = {
  validateJsonResponse
};