const express = require('express');
const mongoClient = require('../utils/mongoClient');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    // Check MongoDB connection
    const db = await mongoClient.connect();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: 'connected',
        api: 'running'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: error.message,
        api: 'running'
      }
    });
  }
});

/**
 * Detailed system status endpoint
 */
router.get('/status', async (req, res) => {
  try {
    // Check MongoDB connection
    const db = await mongoClient.connect();
    
    // Get list of collections
    const collections = await db.listCollections().toArray();
    const projectCollections = collections
      .filter(coll => coll.name.startsWith('project_'))
      .map(coll => coll.name);
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        mongodb: {
          status: 'connected',
          projects: projectCollections.map(name => name.replace('project_', ''))
        },
        api: {
          status: 'running',
          uptime: process.uptime()
        }
      }
    });
  } catch (error) {
    logger.error('Status check failed:', error);
    
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;