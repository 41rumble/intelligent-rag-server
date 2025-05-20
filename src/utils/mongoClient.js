const { MongoClient } = require('mongodb');
const logger = require('./logger');
require('dotenv').config();

// MongoDB connection string
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

// MongoDB client instance
let client;
let db;

/**
 * Connect to MongoDB
 * @returns {Promise<Object>} MongoDB database instance
 */
async function connect() {
  if (db) return db;
  
  try {
    logger.info(`Connecting to MongoDB at ${uri} (database: ${dbName})...`);
    client = new MongoClient(uri);
    await client.connect();
    
    // Get server info to verify connection
    const adminDb = client.db('admin');
    const serverInfo = await adminDb.command({ serverStatus: 1 });
    
    logger.info(`Successfully connected to MongoDB ${serverInfo.version} at ${uri}`);
    logger.info(`Using database: ${dbName}`);
    
    db = client.db(dbName);
    return db;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Close MongoDB connection
 */
async function close() {
  if (client) {
    await client.close();
    logger.info('MongoDB connection closed');
    client = null;
    db = null;
  }
}

/**
 * Get collection by name
 * @param {string} projectId - Project identifier
 * @returns {Promise<Collection>} MongoDB collection
 */
async function getProjectCollection(projectId) {
  const database = await connect();
  return database.collection(`project_${projectId}`);
}

// Vector search is now handled by FAISS in vectorStore.js

/**
 * Create text indexes for a collection if they don't exist
 * @param {string} projectId - Project identifier
 */
async function createTextIndexes(projectId) {
  const database = await connect();
  const collection = database.collection(`project_${projectId}`);
  
  // Check if index exists
  const indexes = await collection.listIndexes().toArray();
  const textIndexExists = indexes.some(index => index.name === 'text_search_index');
  
  if (!textIndexExists) {
    logger.info(`Creating text indexes for project_${projectId}`);
    // Create text search index with field weights
    await collection.createIndex(
      { 
        // Basic content
        text: "text",
        name: "text",
        title: "text",
        tags: "text",

        // Character fields
        "character_data.character_arc.initial_state": "text",
        "character_data.character_arc.final_state": "text",
        "character_data.personality_traits.trait": "text",
        "character_data.motivations.motivation": "text",

        // Relationship fields
        "relationship_data.source_character": "text",
        "relationship_data.target_character": "text",
        "relationship_data.relationship_type": "text",
        "relationship_data.dynamics.power_balance": "text",
        "relationship_data.dynamics.emotional_bond": "text",
        "relationship_data.progression.change": "text",

        // Event fields
        "events.event": "text",
        "events.significance": "text",
        "events.affected_characters.impact": "text",

        // Theme fields
        "theme_data.themes.theme": "text",
        "theme_data.themes.manifestation": "text",
        "theme_data.symbols.symbol": "text",
        "theme_data.symbols.meaning": "text",

        // Location fields
        "locations.location": "text",
        "locations.description": "text",

        // Chapter fields
        "chapter_data.synopsis": "text",
        "chapter_data.narrative_perspective": "text",
        "chapter_data.mood": "text"
      },
      { 
        name: "text_search_index",
        weights: {
          // Primary identifiers
          name: 10,
          title: 10,
          "relationship_data.source_character": 10,
          "relationship_data.target_character": 10,
          
          // Key story elements
          "theme_data.themes.theme": 8,
          "theme_data.symbols.symbol": 8,
          "events.event": 8,
          
          // Important metadata
          "character_data.character_arc.arc_type": 7,
          "relationship_data.relationship_type": 7,
          "theme_data.themes.manifestation": 7,
          
          // Supporting content
          "chapter_data.synopsis": 5,
          tags: 5,
          "locations.location": 5,
          "events.significance": 5,
          
          // Detailed content
          text: 3,
          "locations.description": 3,
          "character_data.personality_traits.trait": 3,
          "relationship_data.progression.change": 3,
          
          // Additional context
          "chapter_data.mood": 2,
          "chapter_data.narrative_perspective": 2,
          "theme_data.symbols.meaning": 2,
          "events.affected_characters.impact": 2
        },
        default_language: "english"
      }
    );

    // Create additional indexes for efficient querying
    await collection.createIndex({ "timeline_data.story_day": 1 });
    await collection.createIndex({ "timeline_data.relative_position": 1 });
    await collection.createIndex({ "chapter_data.chapter_number": 1 });
    await collection.createIndex({ 
      "relationship_data.source_character": 1,
      "relationship_data.target_character": 1,
      type: 1
    });
    await collection.createIndex({ 
      "theme_data.themes.theme": 1,
      "theme_data.themes.strength": -1
    });
    await collection.createIndex({ 
      type: 1,
      "events.impact_level": -1
    });
    logger.info(`Text indexes created for project_${projectId}`);
  }
}

/**
 * Initialize collection with schema validation
 * @param {string} projectId - Project identifier
 */
async function initializeCollection(projectId) {
  const database = await connect();
  const collectionName = `project_${projectId}`;
  
  // Define schema
  const schema = {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["type", "project", "text"],
        properties: {
          // Basic metadata
          type: {
            bsonType: "string",
            enum: [
              "chapter_text",
              "chapter_synopsis",
              "character_bio",
              "character_relationship",
              "plot_event",
              "theme_analysis",
              "location_description",
              "acknowledgement",
              "preface",
              "book_metadata"
            ]
          },
          project: { bsonType: "string" },
          text: { bsonType: "string" },
          
          // Document metadata
          name: { bsonType: "string" },
          title: { bsonType: "string" },
          aliases: {
            bsonType: "array",
            items: { bsonType: "string" }
          },
          tags: {
            bsonType: "array",
            items: { bsonType: "string" }
          },
          
          // Temporal information
          timeline_data: {
            bsonType: "object",
            properties: {
              date: { bsonType: "string" },
              time_period: { bsonType: "string" },
              relative_position: { bsonType: "double" }, // 0-1 position in story
              story_day: { bsonType: "int" }, // Days since story start
              temporal_references: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    reference_type: { bsonType: "string" }, // "flashback", "foreshadowing", etc.
                    referenced_event: { bsonType: "string" },
                    significance: { bsonType: "string" }
                  }
                }
              }
            }
          },

          // Location information
          locations: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["location"],
              properties: {
                location: { bsonType: "string" },
                significance: { bsonType: "string" },
                description: { bsonType: "string" },
                connected_locations: {
                  bsonType: "array",
                  items: {
                    bsonType: "object",
                    properties: {
                      location: { bsonType: "string" },
                      relationship: { bsonType: "string" }
                    }
                  }
                }
              }
            }
          },

          // Event information
          events: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["event"],
              properties: {
                event: { bsonType: "string" },
                significance: { bsonType: "string" },
                event_type: { bsonType: "string" }, // "plot_point", "character_development", etc.
                impact_level: { bsonType: "int" }, // 1-5 scale
                affected_characters: {
                  bsonType: "array",
                  items: {
                    bsonType: "object",
                    properties: {
                      character: { bsonType: "string" },
                      impact: { bsonType: "string" }
                    }
                  }
                }
              }
            }
          },

          // Character information
          character_data: {
            bsonType: "object",
            properties: {
              character_arc: {
                bsonType: "object",
                properties: {
                  arc_type: { bsonType: "string" }, // "redemption", "fall", "growth", etc.
                  initial_state: { bsonType: "string" },
                  final_state: { bsonType: "string" },
                  key_development_points: {
                    bsonType: "array",
                    items: {
                      bsonType: "object",
                      properties: {
                        chapter: { bsonType: "string" },
                        development: { bsonType: "string" },
                        catalyst: { bsonType: "string" }
                      }
                    }
                  }
                }
              },
              personality_traits: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    trait: { bsonType: "string" },
                    evidence: { bsonType: "array", items: { bsonType: "string" } }
                  }
                }
              },
              motivations: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    motivation: { bsonType: "string" },
                    strength: { bsonType: "int" }, // 1-5 scale
                    related_events: { bsonType: "array", items: { bsonType: "string" } }
                  }
                }
              }
            }
          },

          // Relationship information
          relationship_data: {
            bsonType: "object",
            properties: {
              source_character: { bsonType: "string" },
              target_character: { bsonType: "string" },
              relationship_type: { bsonType: "string" },
              dynamics: {
                bsonType: "object",
                properties: {
                  power_balance: { bsonType: "string" },
                  emotional_bond: { bsonType: "string" },
                  trust_level: { bsonType: "double" }, // 0-1 scale
                  conflict_level: { bsonType: "double" } // 0-1 scale
                }
              },
              progression: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    chapter: { bsonType: "string" },
                    change: { bsonType: "string" },
                    cause: { bsonType: "string" },
                    impact: { bsonType: "string" }
                  }
                }
              }
            }
          },

          // Theme information
          theme_data: {
            bsonType: "object",
            properties: {
              themes: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    theme: { bsonType: "string" },
                    manifestation: { bsonType: "string" },
                    strength: { bsonType: "int" }, // 1-5 scale
                    related_elements: {
                      bsonType: "array",
                      items: {
                        bsonType: "object",
                        properties: {
                          element_type: { bsonType: "string" }, // "character", "event", "symbol"
                          element: { bsonType: "string" },
                          connection: { bsonType: "string" }
                        }
                      }
                    }
                  }
                }
              },
              symbols: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    symbol: { bsonType: "string" },
                    meaning: { bsonType: "string" },
                    occurrences: {
                      bsonType: "array",
                      items: {
                        bsonType: "object",
                        properties: {
                          chapter: { bsonType: "string" },
                          context: { bsonType: "string" },
                          significance: { bsonType: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },

          // Chapter-specific information
          chapter_data: {
            bsonType: "object",
            properties: {
              chapter_number: { bsonType: "int" },
              chapter_id: { bsonType: "string" },
              full_text: { bsonType: "string" },
              synopsis: { bsonType: "string" },
              narrative_perspective: { bsonType: "string" },
              pacing: { bsonType: "string" },
              mood: { bsonType: "string" },
              story_arc_position: { bsonType: "string" },
              chunk_index: { bsonType: "int" },
              total_chunks: { bsonType: "int" }
            }
          },

          // Technical metadata
          vector_id: { bsonType: "string" },
          priority: { bsonType: "int" },
          source_files: {
            bsonType: "array",
            items: { bsonType: "string" }
          },
          last_updated: { bsonType: "date" },
          version: { bsonType: "string" }
        }
      }
    }
  };
  
  // Check if collection exists
  const collections = await database.listCollections({ name: collectionName }).toArray();
  
  if (collections.length === 0) {
    logger.info(`Creating collection ${collectionName}`);
    await database.createCollection(collectionName, schema);
    logger.info(`Collection ${collectionName} created with schema validation`);
  } else {
    logger.info(`Updating schema for collection ${collectionName}`);
    await database.command({
      collMod: collectionName,
      validator: schema.validator
    });
    logger.info(`Schema updated for collection ${collectionName}`);
  }
  
  // Create text indexes
  await createTextIndexes(projectId);
}

module.exports = {
  connect,
  close,
  getProjectCollection,
  initializeCollection
};