const express = require('express');
const mongoClient = require('./utils/mongoClient');
const logger = require('./utils/logger');
const healthRouter = require('./api/health');
const queryRouter = require('./api/queryRouter');
require('dotenv').config();

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/health', healthRouter);
app.use('/api/query', queryRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    logger.info('Starting Intelligent RAG Server...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`LLM Provider: ${process.env.LLM_PROVIDER || 'openai'}`);
    
    if (process.env.LLM_PROVIDER === 'ollama') {
      logger.info(`Ollama URL: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
      logger.info(`Ollama Models: ${process.env.OLLAMA_LLM_MODEL || 'llama3'} (LLM), ${process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'} (Embeddings)`);
    }
    
    // Connect to MongoDB
    await mongoClient.connect();
    
    // Start Express server
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/health`);
      logger.info(`API endpoint: http://localhost:${port}/api/query`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  
  try {
    await mongoClient.close();
    logger.info('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();