#!/usr/bin/env node

const path = require('path');
const { buildAndSaveRelationshipMaps } = require('./build_maps');
const logger = require('../../src/utils/logger');

async function main() {
    const projectId = process.argv[2];
    
    if (!projectId) {
        console.error('Please provide a project ID');
        console.error('Usage: node build_maps_cli.js PROJECT_ID');
        process.exit(1);
    }

    // Log the execution context
    const scriptDir = __dirname;
    const projectRoot = path.resolve(scriptDir, '../..');
    logger.info('Script directory:', scriptDir);
    logger.info('Project root:', projectRoot);
    logger.info('Current working directory:', process.cwd());

    try {
        // Change to project root to ensure consistent paths
        process.chdir(projectRoot);
        logger.info('Changed working directory to:', process.cwd());
        
        await buildAndSaveRelationshipMaps(projectId);
        logger.info('Successfully built and saved relationship maps');
        process.exit(0);
    } catch (error) {
        logger.error('Failed to build relationship maps:', error);
        process.exit(1);
    }
}

main();