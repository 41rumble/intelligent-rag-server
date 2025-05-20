const fs = require('fs').promises;
const path = require('path');
const { 
    buildCharacterRelationships,
    buildSocialNetworks,
    buildThematicConnections,
    buildEventNetworks
} = require('../../src/relationships/builders');

const logger = require('../../src/utils/logger');

/**
 * Preprocess and save relationship maps for a project
 */
async function buildAndSaveRelationshipMaps(projectId) {
    logger.info(`Building relationship maps for project ${projectId}`);
    
    try {
        // Get source data from files
        const projectDir = path.join(process.cwd(), 'ingest', projectId);
        logger.info(`Reading data from ${projectDir}`);
        
        // Read chapters first since we need them for bio extraction
        const chaptersPath = path.join(projectDir, 'chapters');
        const chapters = [];
        try {
            const chapterFiles = await fs.readdir(chaptersPath);
            for (const file of chapterFiles) {
                if (file.endsWith('.txt')) {
                    const chapterText = await fs.readFile(path.join(chaptersPath, file), 'utf8');
                    const chapterId = file.replace('.txt', '');
                    chapters.push({
                        type: 'chapter_text',
                        chapter_id: chapterId,
                        text: chapterText
                    });
                }
            }
            logger.info(`Found ${chapters.length} chapters`);
        } catch (error) {
            logger.warn(`No chapters found in ${chaptersPath}: ${error.message}`);
        }

        // Now get or generate bios
        let bios = [];
        
        // Try reading existing bios from the compiled_bios directory
        const compiledBiosPath = path.join(projectDir, 'compiled_bios');
        try {
            const bioFiles = await fs.readdir(compiledBiosPath);
            for (const file of bioFiles) {
                if (file.endsWith('.json')) {
                    const bioData = await fs.readFile(path.join(compiledBiosPath, file), 'utf8');
                    bios.push(JSON.parse(bioData));
                }
            }
            logger.info(`Found ${bios.length} character bios in compiled_bios directory`);
        } catch (error) {
            logger.warn(`No bios found in ${compiledBiosPath}: ${error.message}`);
        }
        
        // If no bios found, extract from text
        if (bios.length === 0 && chapters.length > 0) {
            logger.info('No bios found, extracting character names from text...');
            const allText = chapters.map(ch => ch.text).join('\n');
            
            // Simple name extraction (this is a basic version)
            const namePattern = /[A-Z][a-z]+ (?:[A-Z][a-z]+ )?[A-Z][a-z]+/g;
            const names = [...new Set(allText.match(namePattern) || [])];
            
            bios = names.map(name => ({
                type: 'bio',
                name: name,
                text: `Character named ${name}`,
                source_files: chapters.map(ch => ch.chapter_id)
            }));
            
            logger.info(`Extracted ${bios.length} potential character names`);
        }
        
        if (chapters.length === 0) {
            throw new Error('No chapters found');
        }
        
        // Create relationships directory early
        const relationshipsDir = path.join(projectDir, 'relationships');
        logger.info('Creating directory:', relationshipsDir);
        await fs.mkdir(relationshipsDir, { recursive: true });
        
        // Build and save relationships incrementally
        logger.info('Starting to build relationships...');
        const relationships = [];
        
        // Process each character pair and save immediately
        for (let i = 0; i < bios.length; i++) {
            for (let j = i + 1; j < bios.length; j++) {
                const char1 = bios[i];
                const char2 = bios[j];
                
                // Skip if they never appear in the same chapters
                const sharedChapters = chapters.filter(ch =>
                    ch.text.toLowerCase().includes(char1.name.toLowerCase()) &&
                    ch.text.toLowerCase().includes(char2.name.toLowerCase())
                );
                
                if (sharedChapters.length > 0) {
                    try {
                        // Build relationship
                        logger.info(`Building relationship between ${char1.name} and ${char2.name}...`);
                        const relationship = await buildDetailedRelationship(char1.name, char2.name, sharedChapters);
                        
                        if (relationship) {
                            // Add explicit relationship data if it exists
                            if (char1.relationships?.[char2.name]) {
                                relationship.explicit_description = char1.relationships[char2.name];
                            }
                            if (char2.relationships?.[char1.name]) {
                                relationship.reverse_description = char2.relationships[char1.name];
                            }
                            
                            // Save relationship immediately
                            const filename = `${char1.name}__${char2.name}.json`;
                            const filePath = path.join(relationshipsDir, filename);
                            await fs.writeFile(
                                filePath,
                                JSON.stringify(relationship, null, 2)
                            );
                            logger.info(`Saved relationship to ${filename}`);
                            
                            // Keep in memory only what we need for network analysis
                            relationships.push({
                                source_character: char1.name,
                                target_character: char2.name,
                                type: relationship.type,
                                strength: relationship.strength
                            });
                        }
                    } catch (error) {
                        logger.error(`Error processing relationship between ${char1.name} and ${char2.name}:`, error);
                        // Continue with next pair
                    }
                }
            }
        }
        
        logger.info(`Completed processing ${relationships.length} relationships`);
        
        // Build social networks with minimal relationship data
        const socialNetworks = await buildSocialNetworks(bios, chapters);
        logger.info(`Built ${socialNetworks.length} social networks`);
        
        const thematicConnections = await buildThematicConnections(bios, chapters);
        logger.info(`Built ${thematicConnections.length} thematic connections`);
        
        const eventNetworks = await buildEventNetworks(bios, chapters);
        logger.info(`Built ${eventNetworks.length} event networks`);
        
        // Create optimized lookup maps
        const relationshipMaps = {
            type: 'relationship_maps',
            project_id: projectId,
            created_at: new Date(),
            // Character to character direct relationships
            direct_relationships: {},
            social_networks: socialNetworks,
            thematic_connections: thematicConnections,
            event_networks: eventNetworks,
            // Character groups and communities
            communities: socialNetworks.map(network => network.members.map(m => m.character)),
            // Timeline of relationship developments
            timeline: eventNetworks.map(event => ({
                event: event.event,
                type: event.event_type,
                characters: event.participants.map(p => p.character),
                chapters: event.chapters
            })),
            // Graph representation for path finding
            graph: {
                nodes: bios.map(bio => ({
                    id: bio.name,
                    type: 'character',
                    data: {
                        name: bio.name,
                        role: bio.role,
                        tags: bio.tags || []
                    }
                })),
                edges: relationships.map(rel => ({
                    source: rel.source_character,
                    target: rel.target_character,
                    type: rel.type,
                    weight: rel.strength
                }))
            }
        };

        // Process relationships into optimized maps
        logger.info('Processing relationships into maps...');
        for (const rel of relationships) {
            if (!relationshipMaps.direct_relationships[rel.source_character]) {
                relationshipMaps.direct_relationships[rel.source_character] = {};
            }
            relationshipMaps.direct_relationships[rel.source_character][rel.target_character] = {
                type: rel.type,
                strength: rel.strength,
                key_interactions: rel.key_moments,
                current_state: rel.progression.current_state,
                // Add relevant community info
                communities: relationshipMaps.communities.filter(c => 
                    c.includes(rel.source_character) && c.includes(rel.target_character)
                ),
                // Add relevant timeline events
                timeline: relationshipMaps.timeline.filter(t =>
                    t.characters.includes(rel.source_character) && t.characters.includes(rel.target_character)
                )
            };
        }

        logger.info('Finished processing relationships into maps');
        
        // About to start file operations
        logger.info('About to start file operations');
        logger.info('Project directory:', projectDir);
        logger.info('Relationships array before file ops:', JSON.stringify({
            count: relationships.length,
            first_few: relationships.slice(0, 2)
        }, null, 2));
        
        // Create relationships directory
        const relationshipsDir = path.join(projectDir, 'relationships');
        logger.info('Creating directory:', relationshipsDir);
        try {
            await fs.mkdir(relationshipsDir, { recursive: true });
            logger.info(`Successfully created relationships directory: ${relationshipsDir}`);
        } catch (error) {
            logger.error(`Error creating directory ${relationshipsDir}:`, error);
            throw error;
        }

        // Debug log relationship data
        logger.info('Direct relationships object:', JSON.stringify(relationshipMaps.direct_relationships, null, 2));
        logger.info('Starting to save individual relationship files...');

        // Save each relationship as a separate file
        logger.info('Starting to process relationships for files...');
        try {
            for (const [source, targets] of Object.entries(relationshipMaps.direct_relationships)) {
                logger.info(`Processing relationships for source: ${source} with targets:`, Object.keys(targets));
                for (const [target, data] of Object.entries(targets)) {
                    const filename = `${source}__${target}.json`;
                    const filePath = path.join(relationshipsDir, filename);
                    
                    const relationshipData = {
                        source_character: source,
                        target_character: target,
                        ...data
                    };

                    logger.info(`Saving relationship file: ${filePath}`);
                    try {
                        await fs.writeFile(
                            filePath,
                            JSON.stringify(relationshipData, null, 2)
                        );
                        logger.info(`Successfully saved relationship file: ${filePath}`);
                    } catch (error) {
                        logger.error(`Failed to save relationship file ${filePath}:`, error);
                        throw error;
                    }
                }
            }
            logger.info('Finished processing all relationship files');
        } catch (error) {
            logger.error('Error in relationship file processing:', error);
            throw error;
        }

        // Save the full relationship maps for reference
        const fullMapsPath = path.join(relationshipsDir, 'full_maps.json');
        logger.info(`Saving full relationship maps to: ${fullMapsPath}`);
        try {
            await fs.writeFile(
                fullMapsPath,
                JSON.stringify(relationshipMaps, null, 2)
            );
            logger.info(`Successfully saved full relationship maps to: ${fullMapsPath}`);
        } catch (error) {
            logger.error(`Failed to save full relationship maps to ${fullMapsPath}:`, error);
            throw error;
        }
        
        logger.info(`Successfully saved relationship maps for project ${projectId} to ${relationshipsDir}`);
        return relationshipMaps;
    } catch (error) {
        logger.error('Error building relationship maps:', error);
        throw error;
    }
}

/**
 * Simple community detection
 * This is a basic implementation - you might want to use a more sophisticated algorithm
 */
function detectCommunities(graph) {
    // Placeholder implementation
    // You might want to use something like Louvain or Label Propagation algorithms
    const communities = [];
    const visited = new Set();

    for (const node of graph.nodes) {
        if (!visited.has(node)) {
            const community = new Set([node]);
            const queue = [node];
            visited.add(node);

            while (queue.length > 0) {
                const current = queue.shift();
                const neighbors = graph.edges
                    .filter(e => (e.source === current || e.target === current) && e.weight > 0.5)
                    .map(e => e.source === current ? e.target : e.source);

                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        community.add(neighbor);
                        queue.push(neighbor);
                        visited.add(neighbor);
                    }
                }
            }

            if (community.size > 1) {
                communities.push(Array.from(community));
            }
        }
    }

    return communities;
}

// Export for CLI and testing
module.exports = {
    buildAndSaveRelationshipMaps
};