const fs = require('fs').promises;
const path = require('path');
const logger = require('../src/utils/logger');
const { loadNameMappings, consolidateBios } = require('./utils/bioConsolidator');

// Project ID from command line or default
const projectId = process.argv[2] || 'the_great_fire';

// Paths
const projectPath = path.join(__dirname, projectId);
const rawBiosPath = path.join(projectPath, 'raw_bio_fragments');
const compiledBiosPath = path.join(projectPath, 'compiled_bios');
const configPath = path.join(__dirname, 'config', 'name_mappings.json');

/**
 * Main function to consolidate bios
 */
async function main() {
  try {
    // Load name mappings
    const nameMappings = await loadNameMappings(configPath);
    if (!nameMappings) {
      throw new Error('Failed to load name mappings configuration');
    }

    // Create output directory if it doesn't exist
    await fs.mkdir(compiledBiosPath, { recursive: true });

    // Read all raw bio files
    const bioFiles = await fs.readdir(rawBiosPath);
    const bios = [];

    // Load all bios
    for (const file of bioFiles) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(rawBiosPath, file);
      const bioData = JSON.parse(await fs.readFile(filePath, 'utf8'));
      bios.push(bioData);
    }

    logger.info(`Found ${bios.length} raw bios to process`);

    // Consolidate bios
    const consolidatedBios = consolidateBios(bios, nameMappings);

    logger.info(`Consolidated into ${consolidatedBios.length} unique characters`);

    // Save consolidated bios
    for (const bio of consolidatedBios) {
      const filename = bio.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.json';
      const outputPath = path.join(compiledBiosPath, filename);
      
      await fs.writeFile(
        outputPath,
        JSON.stringify(bio, null, 2)
      );
      
      logger.info(`Saved consolidated bio: ${filename}`);
    }

    logger.info('Bio consolidation completed successfully');
  } catch (error) {
    logger.error('Error in bio consolidation:', error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  consolidateBios
};