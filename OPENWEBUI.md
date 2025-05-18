# Open WebUI Integration Guide

This guide explains how to integrate the Intelligent RAG Server with Open WebUI using the provided function configuration.

## Prerequisites

1. Running instance of the Intelligent RAG Server
2. MongoDB setup and configured
3. Either OpenAI API key or Ollama setup
4. Open WebUI installation

## Function Configuration

The `openwebui-function.json` file provides a function configuration that connects Open WebUI to the Intelligent RAG Server. 

### Parameters

1. `projectId` (required): The ID of the project in the RAG server to query against
2. `thinkingDepth` (optional): Level of processing depth (1-4)
   - Level 1: Basic RAG with vector similarity
   - Level 2: RAG + Database relations
   - Level 3: RAG + DB + Web search
   - Level 4: Enhanced coverage with cross-validation

### Example Usage

The function includes two example configurations:
1. Basic Query: Uses thinking depth 2 for standard queries
2. Deep Analysis: Uses thinking depth 4 for complex analysis

### Setup Instructions

1. Start the Intelligent RAG Server:
   ```bash
   cd intelligent-rag-server
   npm start
   ```

2. Import the pipeline in Open WebUI:
   - Go to Settings > Pipelines
   - Click "Import Pipeline"
   - Select the `openwebui-pipeline.json` file

3. Configure the pipeline:
   - Set the `projectId` parameter to match your ingested project
   - Adjust `thinkingDepth` based on your needs (default: 2)

4. Test the pipeline:
   - Create a new chat
   - Select "Intelligent RAG Pipeline" from the pipeline dropdown
   - Start chatting to test the RAG capabilities

### Response Format

The pipeline will return:
- The main answer in the chat
- Additional metadata showing the reasoning process
- Any errors that occur during processing

### Troubleshooting

1. If you get connection errors:
   - Verify the RAG server is running on port 3000
   - Check if MongoDB is running and accessible
   - Ensure your LLM provider (OpenAI/Ollama) is properly configured

2. If answers are not relevant:
   - Try increasing the thinkingDepth parameter
   - Verify that your project data is properly ingested
   - Check the MongoDB collections for proper embeddings

3. If the pipeline is slow:
   - Consider using a lower thinkingDepth
   - If using Ollama, ensure you have sufficient computational resources
   - Check MongoDB performance and indexes

## Advanced Usage

### Web Search Integration

To enable web search capabilities (Level 3+):
1. Configure a SearXNG instance in the RAG server's `.env` file
2. Set `thinkingDepth` to 3 or higher in the pipeline

### Using Local Models

To use local models with Ollama:
1. Configure the RAG server to use Ollama in `.env`
2. Pull required models:
   ```bash
   ollama pull nomic-embed-text
   ollama pull llama3
   ```
3. The pipeline will automatically use your local setup