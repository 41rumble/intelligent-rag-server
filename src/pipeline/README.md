# RAG Pipeline with Thinking Depth

This pipeline implements a sophisticated RAG (Retrieval-Augmented Generation) system with multiple thinking depth levels.

## Components

### 1. Query Expander
- Expands original query into multiple sub-queries
- Generates context-seeking queries
- Extracts entities and relationships
- Handles temporal aspects

### 2. Multi-Source Search
- RAG search using vector similarity
- Database search for related entities
- Web search for additional context
- Configurable by thinking depth

### 3. Information Synthesizer
- Extracts key points
- Builds timelines
- Maps relationships
- Generates structured summaries

### 4. Pipeline Controller
- Manages overall process
- Implements thinking depth levels
- Generates final answers
- Handles error cases

## Thinking Depth Levels

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
- Web search integration
- Information synthesis
- Structured summaries

### Level 4: Enhanced Coverage
- Everything from Level 3
- Increased search depth (K=7)
- More web sources
- Cross-validation

## Usage

```javascript
const PipelineController = require('./controllers/pipelineController');

// Initialize pipeline
const pipeline = new PipelineController('project_id');

// Process query
const result = await pipeline.process(
  "What happened to the Greeks in Smyrna?",
  3  // thinking depth
);
```

## Response Format

```javascript
{
  answer: {
    answer: "Main answer text...",
    key_points: ["Point 1", "Point 2", ...],
    sources: ["Source 1", "Source 2", ...],
    confidence: 0.85,
    follow_up: ["Question 1?", "Question 2?", ...]
  },
  supporting_info: {
    keyPoints: [...],
    timeline: [...],
    relationships: [...]
  },
  metadata: {
    thinking_depth: 3,
    expanded_queries: {...},
    sources: {
      rag: 5,
      db: 3,
      web: 2
    }
  }
}
```