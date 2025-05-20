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
      updates: [],
      finalResponse: null,
      timeoutId: null
    };

    this.activeResponses.set(requestId, controller);
    return controller;
  }

  /**
   * Update response stream with initial answer
   * @param {string} requestId - Request identifier
   * @param {Object} initialAnswer - Initial answer to stream
   */
  async streamInitialAnswer(requestId, initialAnswer) {
    const controller = this.activeResponses.get(requestId);
    if (!controller) return;

    controller.status = 'streaming_initial';
    this.emit('update', requestId, {
      type: 'initial_answer',
      content: initialAnswer,
      status: 'in_progress'
    });

    // Set timeout for background processing
    controller.timeoutId = setTimeout(() => {
      this.emit('update', requestId, {
        type: 'processing_update',
        content: 'Still processing additional context and analysis...',
        status: 'in_progress'
      });
    }, 5000);
  }

  /**
   * Update response with background processing results
   * @param {string} requestId - Request identifier
   * @param {Object} update - Update information
   */
  async addBackgroundUpdate(requestId, update) {
    const controller = this.activeResponses.get(requestId);
    if (!controller) return;

    controller.updates.push(update);
    controller.status = 'processing_background';

    // Only emit if we're still within reasonable time
    const processingTime = Date.now() - controller.startTime;
    if (processingTime < 30000) { // 30 seconds
      this.emit('update', requestId, {
        type: 'background_update',
        content: update,
        status: 'in_progress'
      });
    }
  }

  /**
   * Finalize response with enhanced answer
   * @param {string} requestId - Request identifier
   * @param {Object} finalAnswer - Enhanced final answer
   */
  async finalizeResponse(requestId, finalAnswer) {
    const controller = this.activeResponses.get(requestId);
    if (!controller) return;

    // Clear any pending timeouts
    if (controller.timeoutId) {
      clearTimeout(controller.timeoutId);
    }

    controller.status = 'completed';
    controller.finalResponse = finalAnswer;

    // Only emit final update if processing time was reasonable
    const processingTime = Date.now() - controller.startTime;
    if (processingTime < 30000) { // 30 seconds
      this.emit('update', requestId, {
        type: 'final_answer',
        content: finalAnswer,
        status: 'completed'
      });
    }

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

    // Clear any pending timeouts
    if (controller.timeoutId) {
      clearTimeout(controller.timeoutId);
    }

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