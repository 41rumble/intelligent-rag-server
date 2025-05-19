const express = require('express');
const router = express.Router();
const { buildCharacterRelationships } = require('../relationships/builders');
const { getProjectCollection } = require('../utils/mongoClient');
const logger = require('../utils/logger');

/**
 * Build relationships for a project
 * POST /api/relationships/build/:projectId
 */
router.post('/build/:projectId', async (req, res) => {
  const { projectId } = req.params;
  
  try {
    logger.info(`Starting relationship building for project ${projectId}`);
    
    // Get the project collection
    const collection = await getProjectCollection(projectId);
    
    // Get all character bios
    const bios = await collection.find({ 
      type: "bio"
    }).toArray();
    
    // Get all chapters
    const chapters = await collection.find({
      type: "chapter_text"
    }).toArray();
    
    // Build relationships
    const relationships = await buildCharacterRelationships(bios, chapters);
    
    logger.info(`Built ${relationships.length} relationships`);
    
    res.json({
      success: true,
      relationships_built: relationships.length,
      relationships: relationships
    });
    
  } catch (error) {
    logger.error('Error building relationships:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get relationships for a project
 * GET /api/relationships/:projectId
 */
router.get('/:projectId', async (req, res) => {
  const { projectId } = req.params;
  
  try {
    const collection = await getProjectCollection(projectId);
    
    // Get all relationship documents
    const relationships = await collection.find({
      type: {
        $in: [
          "character_relationship",
          "social_network",
          "thematic_connection",
          "event_network"
        ]
      }
    }).toArray();
    
    res.json({
      success: true,
      relationships: relationships
    });
    
  } catch (error) {
    logger.error('Error getting relationships:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;