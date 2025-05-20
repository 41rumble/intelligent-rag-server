const fs = require('fs').promises;
const path = require('path');
const logger = require('../../src/utils/logger');
const { storeRelationships } = require('../../src/relationships/storage');
require('dotenv').config();

async function main() {
  try {
    // Get project ID from command line
    const projectId = process.argv[2];
    if (!projectId) {
      throw new Error('Please provide a project ID as argument');
    }

    // Read relationships directory
    const relationshipsDir = path.join(process.cwd(), projectId, 'relationships');
    logger.info(`Reading relationships from ${relationshipsDir}`);
    
    const files = await fs.readdir(relationshipsDir);
    const relationships = [];
    
    // Read each relationship file
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(relationshipsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        relationships.push(JSON.parse(content));
      }
    }
    
    logger.info(`Found ${relationships.length} relationships`);
    
    // Store relationships in MongoDB
    await storeRelationships(projectId, relationships);
    
    logger.info('Successfully stored all relationships in MongoDB');
  } catch (error) {
    logger.error('Error storing relationships:', error);
    process.exit(1);
  }
}

main();