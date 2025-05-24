const logger = require('./logger');

/**
 * Handle pipeline errors with consolidated logging
 * @param {Error} error - The error that occurred
 * @param {Object} context - Context about the pipeline state
 * @returns {Object} Error response for client
 */
function handlePipelineError(error, context) {
  // Extract relevant information with defaults
  const {
    query = '',
    projectId = '',
    expandedQueries = [],
    uniqueDocs = [],
    webResults = null,
    processedContext = null
  } = context || {};

  // Build error context with pipeline state
  const errorContext = {
    error: error.message,
    query,
    project_id: projectId,
    stack: error.stack,
    pipeline_state: {
      expanded_queries: expandedQueries?.length,
      unique_docs: uniqueDocs?.length,
      has_web_results: !!webResults,
      context_length: processedContext?.compressed_text?.length,
      key_points: processedContext?.key_points?.length
    }
  };

  // Log once with full context
  logger.error('Query processing failed:', errorContext);

  // Return error response for client
  return {
    error: 'Failed to process query',
    message: error.message,
    query,
    project_id: projectId
  };
}

module.exports = {
  handlePipelineError
};