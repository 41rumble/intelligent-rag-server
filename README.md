# Intelligent RAG System

A modular, project-aware Retrieval-Augmented Generation (RAG) system using Node.js and MongoDB. The system supports multiple projects (e.g., books or articles), has intelligent ingestion capabilities, semantic reasoning pipelines, and uses MongoDB as the unified store for both knowledge and configuration.

## 🔧 System Architecture

The system is split into two main parts:

1. **Ingestion and Knowledge Breakdown**
2. **Reasoning Pipeline and Query Handler**

## 📋 Prerequisites

- Node.js (v14+)
- MongoDB (v5+)
- OpenAI API key

## 🚀 Getting Started

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/41rumble/intelligent-rag-server.git
   cd intelligent-rag-server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following configuration:

   ```
   # MongoDB Connection
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB_NAME=intelligent_rag

   # OpenAI API
   OPENAI_API_KEY=your_openai_api_key

   # Embedding Model
   EMBEDDING_MODEL=text-embedding-ada-002

   # LLM Model
   LLM_MODEL=gpt-4-1106-preview

   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Web Search API (optional)
   SEARXNG_INSTANCE=https://searx.example.com
   ```

4. Update the `.env` file with your specific configuration:
   - `MONGODB_URI`: Your MongoDB connection string (local or Atlas)
   - `MONGODB_DB_NAME`: Name for your database (default: intelligent_rag)
   - `OPENAI_API_KEY`: Your OpenAI API key for embeddings and LLM
   - `EMBEDDING_MODEL`: OpenAI embedding model to use (default: text-embedding-ada-002)
   - `LLM_MODEL`: OpenAI model for text generation (default: gpt-4-1106-preview)
   - `PORT`: Port for the API server (default: 3000)
   - `NODE_ENV`: Environment (development or production)
   - `SEARXNG_INSTANCE`: Optional SearXNG instance URL for web search

### Running the Server

Start the server:
```
npm start
```

For development with auto-restart:
```
npm run dev
```

## 📚 Ingestion Process

### 1. Prepare Content

Split your book or article into chapters and save them as text files in the appropriate directory:
```
/ingest/your_project_name/chapters/chapter_01.txt
/ingest/your_project_name/chapters/chapter_02.txt
...
```

### 2. Run Summarization and Extraction

Process the chapters to generate synopses and extract character information:
```
npm run ingest your_project_name
```

This will:
- Generate chapter synopses in `/ingest/your_project_name/synopses/`
- Extract character bio fragments in `/ingest/your_project_name/raw_bio_fragments/`

### 3. Manual Curation (Required)

Review and merge the bio fragments into compiled character bios:
1. Review the generated bio fragments in `/ingest/your_project_name/raw_bio_fragments/`
2. Manually create compiled bios in `/ingest/your_project_name/compiled_bios/`

### 4. Generate Embeddings and Store in MongoDB

Process the synopses and compiled bios to generate embeddings and store in MongoDB:
```
npm run embed your_project_name
```

## 🔍 Using the Query API

Send queries to the API:

```
POST /api/query
```

Request body:
```json
{
  "projectId": "your_project_name",
  "query": "Why did the fire spread quickly?",
  "thinkingDepth": 7
}
```

Response:
```json
{
  "answer": "The fire spread quickly due to several factors...",
  "log": {
    "query": "Why did the fire spread quickly?",
    "steps": [...]
  }
}
```

### Thinking Depth Levels

| Level | Description                                        |
| ----- | -------------------------------------------------- |
| 1     | Basic RAG (vector similarity + top 3 chunks)       |
| 2     | RAG + DB Relations (entity extraction, mapping)    |
| 3     | RAG + DB + Web (SearXNG integration, synthesis)    |
| 4     | Enhanced Coverage (more sources, cross-validation)  |

Each level builds on the previous one, adding more sophisticated processing:

### Level 1: Basic RAG
- Direct vector similarity search
- Top 3 most relevant chunks
- Simple answer generation

### Level 2: RAG + DB Relations
- Everything from Level 1
- Entity extraction
- Relationship mapping
- Database lookups

### Level 3: RAG + DB + Web
- Everything from Level 2
- Web search integration (SearXNG)
- Information synthesis
- Structured summaries

### Level 4: Enhanced Coverage
- Everything from Level 3
- Increased search depth (K=7)
- More web sources
- Cross-validation

## 🧪 API Endpoints

- `GET /health` - Check system health
- `GET /health/status` - Get detailed system status
- `POST /api/query` - Submit a query

## ⚙️ Environment Variables

The system uses the following environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017 |
| `MONGODB_DB_NAME` | MongoDB database name | intelligent_rag |
| `LLM_PROVIDER` | LLM provider to use | openai |
| `OPENAI_API_KEY` | OpenAI API key | (required if using OpenAI) |
| `EMBEDDING_MODEL` | Embedding model | text-embedding-ada-002 |
| `LLM_MODEL` | LLM model | gpt-4-1106-preview |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `SEARXNG_INSTANCE` | SearXNG instance URL | (optional) |
| `OLLAMA_BASE_URL` | Ollama API base URL | http://localhost:11434 |
| `OLLAMA_EMBEDDING_MODEL` | Ollama embedding model | nomic-embed-text |
| `OLLAMA_LLM_MODEL` | Ollama LLM model | llama3 |

### Model Selection

#### Using OpenAI (Default)

- **Embedding Model**: The system uses OpenAI's embedding models to convert text into vector representations. The default is `text-embedding-ada-002` which provides 1536-dimensional embeddings.

- **LLM Model**: For text generation, the system uses OpenAI's GPT models. The default is `gpt-4-1106-preview` which provides the best quality responses, but you can use other models like `gpt-3.5-turbo` for faster, more cost-effective processing.

#### Using Ollama (Local)

To use Ollama instead of OpenAI, set the following environment variables:

```
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_LLM_MODEL=llama3
```

Make sure you have the required models pulled in Ollama:
```bash
ollama pull nomic-embed-text
ollama pull llama3
```

### Web Search Configuration

The optional web search feature requires a SearXNG instance. SearXNG is a privacy-respecting metasearch engine that can be self-hosted or you can use a public instance. Set the `SEARXNG_INSTANCE` variable to enable this feature.

## 📄 License

MIT