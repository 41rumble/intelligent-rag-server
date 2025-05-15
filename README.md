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
| 0     | Shallow RAG (vector + priority metadata retrieval) |
| 2     | Rephrase query to improve relevance                |
| 4     | Generate branch queries (semantically linked)      |
| 5     | Fetch knowledge for each sub-query                 |
| 7     | External search (e.g., SearXNG) and summarization  |
| 8     | Merge and compress context into Knowledge Lumps    |
| 9     | Evaluate answers; retry failed branches            |
| 10    | Compose a final reflective answer via LLM          |

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
| `OPENAI_API_KEY` | OpenAI API key | (required) |
| `EMBEDDING_MODEL` | OpenAI embedding model | text-embedding-ada-002 |
| `LLM_MODEL` | OpenAI LLM model | gpt-4-1106-preview |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `SEARXNG_INSTANCE` | SearXNG instance URL | (optional) |

### Model Selection

- **Embedding Model**: The system uses OpenAI's embedding models to convert text into vector representations. The default is `text-embedding-ada-002` which provides 1536-dimensional embeddings.

- **LLM Model**: For text generation, the system uses OpenAI's GPT models. The default is `gpt-4-1106-preview` which provides the best quality responses, but you can use other models like `gpt-3.5-turbo` for faster, more cost-effective processing.

### Web Search Configuration

The optional web search feature requires a SearXNG instance. SearXNG is a privacy-respecting metasearch engine that can be self-hosted or you can use a public instance. Set the `SEARXNG_INSTANCE` variable to enable this feature.

## 📄 License

MIT