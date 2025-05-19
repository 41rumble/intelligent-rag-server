#!/usr/bin/env node

const { buildAndSaveRelationshipMaps } = require('./build_maps');
const logger = require('../../src/utils/logger');

async function main() {
    const projectId = process.argv[2];
    
    if (!projectId) {
        console.error('Please provide a project ID');
        console.error('Usage: node build_maps_cli.js PROJECT_ID');
        process.exit(1);
    }

    try {
        await buildAndSaveRelationshipMaps(projectId);
        logger.info('Successfully built and saved relationship maps');
        process.exit(0);
    } catch (error) {
        logger.error('Failed to build relationship maps:', error);
        process.exit(1);
    }
}

main();