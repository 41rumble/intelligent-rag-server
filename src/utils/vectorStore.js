const faiss = require('faiss-node');
const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger');

// Store FAISS indexes by project
const indexes = new Map();

/**
 * Initialize FAISS index for a project
 * @param {string} projectId - Project identifier
 * @param {number} dimensions - Embedding dimensions (default: 1536 for text-embedding-ada-002)
 */
async function initializeIndex(projectId, dimensions = 1536) {
    if (indexes.has(projectId)) {
        return indexes.get(projectId);
    }

    // Get FAISS data directory from environment variable or use default
    const faissDataDir = process.env.FAISS_DATA_DIR || path.join(process.cwd(), 'data', 'faiss_indexes');
    await fs.mkdir(faissDataDir, { recursive: true });

    const indexPath = path.join(faissDataDir, `${projectId}.index`);

    try {
        // Try to load existing index
        const index = await faiss.IndexFlatL2.restore(indexPath);
        indexes.set(projectId, index);
        logger.info(`Loaded existing FAISS index for project ${projectId}`);
        return index;
    } catch (error) {
        // Create new index if loading fails
        const index = new faiss.IndexFlatL2(dimensions);
        indexes.set(projectId, index);
        logger.info(`Created new FAISS index for project ${projectId}`);
        return index;
    }
}

/**
 * Add vectors to the index
 * @param {string} projectId - Project identifier
 * @param {Array<Array<number>>} vectors - Array of embedding vectors
 * @param {Array<string>} ids - Array of document IDs corresponding to vectors
 */
async function addVectors(projectId, vectors, ids) {
    const index = await initializeIndex(projectId);
    
    // Validate vectors
    if (!Array.isArray(vectors) || vectors.length === 0) {
        throw new Error('Vectors must be a non-empty array');
    }
    if (!vectors.every(v => Array.isArray(v) && v.length === 1536)) {
        throw new Error('Each vector must be an array of 1536 numbers');
    }
    
    // Convert vectors to Float32Array
    const vectorArray = new Float32Array(vectors.flat());
    
    // Add vectors to index
    await index.add(vectorArray);

    // Save index to disk
    const faissDataDir = process.env.FAISS_DATA_DIR || path.join(process.cwd(), 'data', 'faiss_indexes');
    const indexPath = path.join(faissDataDir, `${projectId}.index`);
    await index.save(indexPath);

    logger.info(`Added ${vectors.length} vectors to FAISS index for project ${projectId}`);
}

/**
 * Search for similar vectors
 * @param {string} projectId - Project identifier
 * @param {Array<number>} queryVector - Query embedding vector
 * @param {number} k - Number of results to return
 * @returns {Promise<Array<{id: string, score: number}>>} Array of document IDs and similarity scores
 */
async function searchVectors(projectId, queryVector, k = 5) {
    const index = await initializeIndex(projectId);
    
    // Validate query vector
    if (!Array.isArray(queryVector) || queryVector.length !== 1536) {
        throw new Error('Query vector must be an array of 1536 numbers');
    }
    
    // Convert query vector to Float32Array
    const queryArray = new Float32Array(queryVector);
    
    const results = await index.search(queryArray, k);
    return results.map((result, i) => ({
        id: result.id,
        score: result.score
    }));
}

/**
 * Remove vectors from the index
 * @param {string} projectId - Project identifier
 * @param {Array<string>} ids - Array of document IDs to remove
 */
async function removeVectors(projectId, ids) {
    const index = await initializeIndex(projectId);
    
    // Remove vectors from index
    await index.remove(ids);

    // Save index to disk
    const faissDataDir = process.env.FAISS_DATA_DIR || path.join(process.cwd(), 'data', 'faiss_indexes');
    const indexPath = path.join(faissDataDir, `${projectId}.index`);
    await index.save(indexPath);

    logger.info(`Removed ${ids.length} vectors from FAISS index for project ${projectId}`);
}

module.exports = {
    initializeIndex,
    addVectors,
    searchVectors,
    removeVectors
};