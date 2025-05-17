const faiss = require('faiss-node');
const fs = require('fs/promises');
const path = require('path');
const logger = require('./logger');

// Store FAISS indexes by project
const indexes = new Map();

/**
 * Get embedding dimensions based on LLM provider
 * @returns {number} Embedding dimensions
 */
function getEmbeddingDimensions() {
    const provider = process.env.LLM_PROVIDER || 'openai';
    if (provider === 'openai') {
        return 1536; // text-embedding-ada-002 dimensions
    } else if (provider === 'ollama') {
        return 768; // nomic-embed-text dimensions
    }
    throw new Error(`Unknown LLM provider: ${provider}`);
}

/**
 * Initialize FAISS index for a project
 * @param {string} projectId - Project identifier
 * @param {number} dimensions - Embedding dimensions (optional, will be determined from LLM provider if not specified)
 */
async function initializeIndex(projectId, dimensions = null) {
    if (indexes.has(projectId)) {
        return indexes.get(projectId);
    }

    // Get FAISS data directory from environment variable or use default
    const faissDataDir = process.env.FAISS_DATA_DIR || path.join(process.cwd(), 'data', 'faiss_indexes');
    await fs.mkdir(faissDataDir, { recursive: true });

    const indexPath = path.join(faissDataDir, `${projectId}.index`);
    const metadataPath = path.join(faissDataDir, `${projectId}.meta.json`);

    try {
        // Try to load existing index and metadata
        const index = await faiss.IndexFlatL2.restore(indexPath);
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        
        // Validate dimensions match
        const expectedDimensions = dimensions || getEmbeddingDimensions();
        if (metadata.dimensions !== expectedDimensions) {
            throw new Error(`Index dimensions (${metadata.dimensions}) don't match expected dimensions (${expectedDimensions})`);
        }
        
        indexes.set(projectId, index);
        logger.info(`Loaded existing FAISS index for project ${projectId} (${metadata.dimensions} dimensions)`);
        return index;
    } catch (error) {
        // Create new index if loading fails
        const dims = dimensions || getEmbeddingDimensions();
        const index = new faiss.IndexFlatL2(dims);
        indexes.set(projectId, index);
        
        // Save metadata
        await fs.writeFile(metadataPath, JSON.stringify({
            dimensions: dims,
            provider: process.env.LLM_PROVIDER || 'openai',
            model: process.env.LLM_PROVIDER === 'openai' ? 
                (process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002') :
                (process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'),
            created_at: new Date().toISOString()
        }, null, 2));
        
        logger.info(`Created new FAISS index for project ${projectId} (${dims} dimensions)`);
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
    
    // Get expected dimensions
    const expectedDimensions = getEmbeddingDimensions();
    
    // Validate vectors
    if (!Array.isArray(vectors) || vectors.length === 0) {
        throw new Error('Vectors must be a non-empty array');
    }
    if (!vectors.every(v => Array.isArray(v) && v.length === expectedDimensions)) {
        throw new Error(`Each vector must be an array of ${expectedDimensions} numbers`);
    }
    
    // Convert vectors to Float32Array and reshape for FAISS
    const numVectors = vectors.length;
    const vectorArray = new Float32Array(vectors.flat());
    const vectorList = Array.from(vectorArray);
    
    logger.debug(`Adding ${numVectors} vectors with ${expectedDimensions} dimensions each`);
    logger.debug(`First vector sample: ${vectorList.slice(0, 5)}...`);
    
    // Add vectors to index
    await index.add(vectorList);

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
    
    // Get expected dimensions
    const expectedDimensions = getEmbeddingDimensions();
    
    // Validate query vector
    if (!Array.isArray(queryVector) || queryVector.length !== expectedDimensions) {
        throw new Error(`Query vector must be an array of ${expectedDimensions} numbers`);
    }
    
    // Convert query vector to Float32Array and then to regular array for FAISS
    const queryArray = Array.from(new Float32Array(queryVector));
    
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