const logger = require('../../utils/logger');
const { EventEmitter } = require('events');

/**
 * Manages response generation and streaming
 */
class ResponseManager extends EventEmitter {
  constructor() {
    super();
    this.activeResponses = new Map();
  }

  /**
   * Initialize a new response stream
   * @param {string} requestId - Unique request identifier
   * @returns {Object} Response stream controller
   */
  initializeStream(requestId) {
    const controller = {
      status: 'initializing',
      startTime: Date.now(),
      finalResponse: null
    };

    this.activeResponses.set(requestId, controller);
    return controller;
  }

  /**
   * Update response stream with answer chunk
   * @param {string} requestId - Request identifier
   * @param {Object} chunk - Answer chunk to stream
   */
  async streamChunk(requestId, chunk) {
    const controller = this.activeResponses.get(requestId);
    if (!controller) return;

    controller.status = 'streaming';
    this.emit('update', requestId, {
      type: 'chunk',
      content: chunk,
      status: 'in_progress'
    });
  }

  /**
   * Finalize response with complete answer
   * @param {string} requestId - Request identifier
   * @param {Object} finalAnswer - Complete answer
   */
  async finalizeResponse(requestId, finalAnswer) {
    const controller = this.activeResponses.get(requestId);
    if (!controller) return;

    controller.status = 'completed';
    controller.finalResponse = finalAnswer;

    this.emit('update', requestId, {
      type: 'final',
      content: finalAnswer,
      status: 'completed'
    });

    // Cleanup
    this.activeResponses.delete(requestId);
  }

  /**
   * Handle error in response processing
   * @param {string} requestId - Request identifier
   * @param {Error} error - Error object
   */
  async handleError(requestId, error) {
    const controller = this.activeResponses.get(requestId);
    if (!controller) return;

    controller.status = 'error';
    this.emit('update', requestId, {
      type: 'error',
      content: error.message,
      status: 'error'
    });

    // Cleanup
    this.activeResponses.delete(requestId);
  }

  /**
   * Check if response is taking too long
   * @param {string} requestId - Request identifier
   * @returns {boolean} True if processing should be terminated
   */
  shouldTerminate(requestId) {
    const controller = this.activeResponses.get(requestId);
    if (!controller) return true;

    const processingTime = Date.now() - controller.startTime;
    return processingTime > 45000; // 45 seconds
  }
}

module.exports = ResponseManager;