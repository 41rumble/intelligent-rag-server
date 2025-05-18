// Mock environment variables
process.env.MONGODB_URI = 'mongodb://localhost:27017';
process.env.MONGODB_DB_NAME = 'intelligent_rag_test';
process.env.SEARXNG_INSTANCE = 'http://localhost:8880';
process.env.LLM_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'test-key';

// Mock logger to avoid console noise during tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock MongoDB client
jest.mock('../src/utils/mongoClient', () => {
  const mockCollection = {
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([])
  };

  return {
    connect: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue(true),
    getProjectCollection: jest.fn().mockResolvedValue(mockCollection),
    initializeCollection: jest.fn().mockResolvedValue(true)
  };
});

// Mock vector store
jest.mock('../src/utils/vectorStore', () => ({
  initializeIndex: jest.fn().mockResolvedValue({}),
  addVectors: jest.fn().mockResolvedValue(true),
  searchVectors: jest.fn().mockResolvedValue([]),
  removeVectors: jest.fn().mockResolvedValue(true)
}));

// Mock LLM provider
jest.mock('../src/utils/llmProvider', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
  generateStructuredResponse: jest.fn().mockResolvedValue({
    answer: 'Test answer',
    key_points: ['Point 1', 'Point 2'],
    confidence: 0.8
  })
}));

// Mock axios for web search
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    data: {
      results: [
        {
          title: 'Test Result',
          url: 'http://example.com',
          content: 'Test content',
          engine: 'test_engine',
          score: 1.0
        }
      ]
    }
  })
}));