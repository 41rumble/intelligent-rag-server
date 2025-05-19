# Character Relationships and Enhanced Search

This document outlines the implementation of character relationship analysis and enhanced search capabilities.

## Overview

The system consists of two main components:
1. Relationship Building Pipeline - Analyzes and stores character relationships and connections
2. Enhanced Search Pipeline - Integrates relationship data into search when relevant

## 1. Relationship Building Pipeline

### A. New Collections

1. Character Relationships
```javascript
{
  type: "character_relationship",
  source_character: "Character A",
  target_character: "Character B",
  relationship_type: "family|friend|antagonist|etc",
  strength: 1-10,
  timeline: [{
    chapter: "chapter_id",
    interaction: "description",
    significance: "high|medium|low"
  }]
}
```

2. Social Networks
```javascript
{
  type: "social_network",
  group_name: "Royal Court",
  time_period: "1666",
  members: [{
    character: "Character A",
    role: "Advisor",
    influence: 1-10
  }]
}
```

3. Thematic Connections
```javascript
{
  type: "thematic_connection",
  theme: "redemption",
  characters: [{
    name: "Character A",
    development: [{
      chapter: "chapter_id",
      description: "Initial fall from grace"
    }]
  }]
}
```

4. Event Networks
```javascript
{
  type: "event_network",
  event: "The Great Fire",
  event_type: "disaster|meeting|battle|etc",
  participants: [{
    character: "Character A",
    role: "witness|instigator|victim|etc",
    impact: "major|minor"
  }],
  themes: ["destruction", "renewal"],
  chapters: ["chapter_5", "chapter_6"]
}
```

### B. Implementation Steps

1. Schema Setup
- [ ] Create new MongoDB collections with validation
- [ ] Set up appropriate indexes
- [ ] Add relationship metadata to existing collections

2. Relationship Extraction
- [ ] Extract explicit relationships from bios
- [ ] Analyze character co-occurrences in chapters
- [ ] Identify social groups and spheres of influence
- [ ] Map character involvement in events

3. Analysis Components
- [ ] Implement relationship strength calculation
- [ ] Build social network analysis
- [ ] Create thematic connection mapping
- [ ] Develop event network builder

4. Integration Points
- [ ] Add hooks for bio updates
- [ ] Create relationship update triggers
- [ ] Implement consistency checks
- [ ] Add validation and verification

## 2. Enhanced Search Pipeline

### A. Query Classification

1. Query Types
- Character-specific (requires relationships)
- Scene/event-specific (standard search)
- Mixed queries (selective relationship use)
- Thematic queries (selective relationship use)

2. Classification System
```javascript
{
  type: "CHARACTER_SPECIFIC|SCENE_SPECIFIC|etc",
  requiresRelationships: boolean,
  characterFocused: boolean,
  entities: {
    characters: [],
    locations: [],
    events: []
  }
}
```

### B. Implementation Steps

1. Query Analysis
- [ ] Implement query type detection
- [ ] Add named entity recognition
- [ ] Create query intent classifier
- [ ] Build entity extractor

2. Search Router
- [ ] Create query router based on type
- [ ] Implement relationship-aware search
- [ ] Add standard search enhancement
- [ ] Build result merger

3. Result Ranking
- [ ] Add relationship-aware scoring
- [ ] Implement context-based ranking
- [ ] Create combined score calculator
- [ ] Build result formatter

4. Performance Optimization
- [ ] Add query caching
- [ ] Implement selective loading
- [ ] Create index optimization
- [ ] Add performance monitoring

## Development Phases

### Phase 1: Relationship Pipeline
1. Set up new collections and schemas
2. Implement basic relationship extraction
3. Build analysis components
4. Add integration points

### Phase 2: Search Enhancement
1. Implement query classification
2. Build search router
3. Add relationship-aware search
4. Optimize performance

### Phase 3: Integration & Testing
1. Combine both pipelines
2. Add comprehensive testing
3. Optimize performance
4. Document API and usage

## API Examples

1. Relationship Building
```javascript
// Build relationships for a project
POST /api/v1/projects/:projectId/relationships/build

// Update relationships for specific characters
POST /api/v1/projects/:projectId/relationships/update
{
  characters: ["Character A", "Character B"]
}
```

2. Enhanced Search
```javascript
// Search with automatic relationship integration
GET /api/v1/projects/:projectId/search?q=query

// Search with explicit relationship options
POST /api/v1/projects/:projectId/search
{
  query: "search query",
  options: {
    includeRelationships: true,
    relationshipTypes: ["family", "social"]
  }
}
```

## Notes

- Relationship data is built and updated separately from the main bio pipeline
- Search uses relationships only when relevant to the query
- All relationship data maintains references to source material
- Updates to bios trigger relationship updates when needed