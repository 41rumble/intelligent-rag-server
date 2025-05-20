const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { 
  buildCharacterRelationships,
  buildSocialNetworks,
  buildThematicConnections,
  buildEventNetworks
} = require('./builders');

/**
 * Main relationship builder that orchestrates the entire process
 * @param {string} projectId - Project identifier
 */
async function buildRelationships(projectId) {
  logger.info(`Building relationships for project ${projectId}`);
  
  try {
    const projectPath = path.join('ingest', projectId);
    
    // 1. Load all character bios from compiled_bios directory
    const bioFiles = await fs.readdir(path.join(projectPath, 'compiled_bios'));
    const bios = await Promise.all(
      bioFiles.filter(f => f.endsWith('.json')).map(async file => {
        const content = await fs.readFile(
          path.join(projectPath, 'compiled_bios', file),
          'utf-8'
        );
        return JSON.parse(content);
      })
    );
    
    logger.info(`Found ${bios.length} character bios`);

    // 2. Load all chapters from chapters directory
    const chapterFiles = await fs.readdir(path.join(projectPath, 'chapters'));
    const chapters = await Promise.all(
      chapterFiles.filter(f => f.endsWith('.txt')).map(async file => {
        const content = await fs.readFile(
          path.join(projectPath, 'chapters', file),
          'utf-8'
        );
        return {
          chapter_id: path.basename(file, '.txt'),
          text: content
        };
      })
    );
    
    logger.info(`Found ${chapters.length} chapters`);

    // 3. Build different types of relationships
    const relationships = await buildCharacterRelationships(bios, chapters);
    const socialNetworks = await buildSocialNetworks(bios, chapters);
    const thematicConnections = await buildThematicConnections(bios, chapters);
    const eventNetworks = await buildEventNetworks(bios, chapters);

    // 4. Store all relationship data in project directory
    const relationshipData = {
      relationships,
      social_networks: socialNetworks,
      thematic_connections: thematicConnections,
      event_networks: eventNetworks
    };

    await fs.writeFile(
      path.join(projectPath, 'relationships.json'),
      JSON.stringify(relationshipData, null, 2)
    );

    logger.info('Relationship building completed successfully');
    
    return {
      relationships: relationships.length,
      socialNetworks: socialNetworks.length,
      thematicConnections: thematicConnections.length,
      eventNetworks: eventNetworks.length
    };
  } catch (error) {
    logger.error('Error building relationships:', error);
    throw error;
  }
}

// Export the main builder function
module.exports = {
  buildRelationships
};