const { buildCharacterRelationships } = require('../../src/relationships/builders');
const { getProjectCollection } = require('../../src/utils/mongoClient');
const logger = require('../../src/utils/logger');

/**
 * Preprocess and save relationship maps for a project
 */
async function buildAndSaveRelationshipMaps(projectId) {
    logger.info(`Building relationship maps for project ${projectId}`);
    
    try {
        const collection = await getProjectCollection(projectId);
        
        // Get source data
        const bios = await collection.find({ type: "bio" }).toArray();
        const chapters = await collection.find({ type: "chapter_text" }).toArray();
        
        // Build relationships
        const relationships = await buildCharacterRelationships(bios, chapters);
        
        // Create optimized lookup maps
        const relationshipMaps = {
            type: 'relationship_maps',
            project_id: projectId,
            created_at: new Date(),
            // Character to character direct relationships
            direct_relationships: {},
            // Character groups and communities
            communities: [],
            // Timeline of relationship developments
            timeline: [],
            // Graph representation for path finding
            graph: {
                nodes: [],
                edges: []
            }
        };

        // Process relationships into optimized maps
        for (const rel of relationships) {
            // Direct relationships lookup
            if (!relationshipMaps.direct_relationships[rel.source_character]) {
                relationshipMaps.direct_relationships[rel.source_character] = {};
            }
            relationshipMaps.direct_relationships[rel.source_character][rel.target_character] = {
                strength: rel.strength,
                type: rel.type,
                key_interactions: rel.key_moments.slice(0, 5), // Top 5 key moments
                current_state: rel.progression.current_state
            };

            // Add to graph
            if (!relationshipMaps.graph.nodes.includes(rel.source_character)) {
                relationshipMaps.graph.nodes.push(rel.source_character);
            }
            if (!relationshipMaps.graph.nodes.includes(rel.target_character)) {
                relationshipMaps.graph.nodes.push(rel.target_character);
            }
            relationshipMaps.graph.edges.push({
                source: rel.source_character,
                target: rel.target_character,
                weight: rel.strength.score
            });

            // Add significant changes to timeline
            rel.progression.significant_changes.forEach(change => {
                relationshipMaps.timeline.push({
                    characters: [rel.source_character, rel.target_character],
                    change: change,
                    chapter: change.chapter
                });
            });
        }

        // Sort timeline
        relationshipMaps.timeline.sort((a, b) => a.chapter.localeCompare(b.chapter));

        // Detect communities using simple clustering
        // This is a placeholder - you might want to use a more sophisticated algorithm
        relationshipMaps.communities = detectCommunities(relationshipMaps.graph);

        // Save to MongoDB
        await collection.updateOne(
            { type: 'relationship_maps', project_id: projectId },
            { $set: relationshipMaps },
            { upsert: true }
        );

        logger.info(`Successfully saved relationship maps for project ${projectId}`);
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