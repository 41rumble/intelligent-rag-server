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
   git clone https://github.com/yourusername/intelligent-rag-server.git
   cd intelligent-rag-server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the provided `.env.example`:
   ```
   cp .env.example .env
   ```

4. Update the `.env` file with your MongoDB connection string and OpenAI API key.

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

## 📄 License

MIT