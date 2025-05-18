const MultiSourceSearch = require('../../../src/pipeline/services/multiSourceSearch');
const vectorStore = require('../../../src/utils/vectorStore');
const mongoClient = require('../../../src/utils/mongoClient');
const webSearch = require('../../../src/utils/webSearch');

jest.mock('../../../src/utils/vectorStore', () => ({
  searchVectors: jest.fn(),
  searchDocuments: jest.fn()
}));

jest.mock('../../../src/utils/mongoClient', () => ({
  getProjectCollection: jest.fn().mockReturnValue({
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn()
  })
}));

jest.mock('../../../src/utils/webSearch', () => ({
  search: jest.fn(),
  contextSearch: jest.fn()
}));

jest.mock('../../../src/utils/llmProvider', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

describe('MultiSourceSearch', () => {
  let multiSourceSearch;

  beforeEach(() => {
    multiSourceSearch = new MultiSourceSearch('test-project');
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should search all sources and combine results', async () => {
      // Mock vector store results
      // Mock vector store results
      vectorStore.searchVectors.mockResolvedValueOnce([{
        id: 'vec1',
        score: 0.9
      }]);

      // Mock MongoDB document retrieval for RAG search
      mongoClient.getProjectCollection().find().toArray.mockResolvedValueOnce([{
        vector_id: 'vec1',
        text: 'RAG content',
        type: 'document',
        title: 'Test Doc',
        time_period: '1922',
        locations: ['Smyrna'],
        events: ['Great Fire'],
        source_files: ['doc1.pdf']
      }]);

      // Mock MongoDB text search
      mongoClient.getProjectCollection().find().sort().limit().toArray.mockResolvedValueOnce([{
        text: 'DB content',
        type: 'document',
        title: 'Test Doc',
        score: 0.8
      }]);

      // Mock web search results
      webSearch.contextSearch.mockResolvedValueOnce([{
        title: 'Web Result',
        content: 'Web content',
        url: 'http://example.com',
        score: 0.7,
        source: 'google'
      }]);

      const query = {
        original: 'test query',
        context_queries: ['context query'],
        relationship_queries: ['relationship query'],
        temporal_queries: ['temporal query']
      };
      
      const results = await multiSourceSearch.search(query, 4);

      expect(results).toHaveProperty('rag');
      expect(results).toHaveProperty('db');
      expect(results).toHaveProperty('web');

      expect(results.rag).toHaveLength(1);
      expect(results.db).toHaveLength(1);
      expect(results.web).toHaveLength(1);

      expect(vectorStore.searchVectors).toHaveBeenCalledWith('test-project', [0.1, 0.2, 0.3], expect.any(Number));
      expect(mongoClient.getProjectCollection).toHaveBeenCalledWith('test-project');
      expect(webSearch.contextSearch).toHaveBeenCalledWith(query.original, expect.any(Object));
    });

    it('should handle errors from individual sources', async () => {
      // Mock error from vector store
      // Mock error from vector store
      vectorStore.searchVectors.mockRejectedValueOnce(new Error('RAG error'));

      // Mock successful MongoDB results
      mongoClient.getProjectCollection().find().toArray.mockResolvedValueOnce([{
        text: 'DB content',
        type: 'document',
        title: 'Test Doc',
        score: 0.8
      }]);

      // Mock successful web results
      webSearch.contextSearch.mockResolvedValueOnce([{
        title: 'Web Result',
        content: 'Web content',
        url: 'http://example.com',
        score: 0.7,
        source: 'google'
      }]);

      const query = {
        original: 'test query',
        context_queries: [],
        relationship_queries: [],
        temporal_queries: []
      };

      const results = await multiSourceSearch.search(query, 4);

      expect(results.rag).toHaveLength(0);
      expect(results.db).toHaveLength(1);
      expect(results.web).toHaveLength(1);
    });

    it('should respect source selection', async () => {
      const query = {
        original: 'test query',
        context_queries: [],
        relationship_queries: [],
        temporal_queries: []
      };

      // Mock vector store results for RAG search
      vectorStore.searchVectors.mockResolvedValueOnce([{
        id: 'vec1',
        score: 0.9
      }]);

      // Mock MongoDB document retrieval for RAG search
      const mockCollection = {
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn()
      };
      mockCollection.toArray.mockResolvedValueOnce([{
        vector_id: 'vec1',
        text: 'RAG content',
        type: 'document',
        title: 'Test Doc',
        time_period: '1922',
        locations: ['Smyrna'],
        events: ['Great Fire'],
        source_files: ['doc1.pdf']
      }]);
      mongoClient.getProjectCollection.mockReturnValue(mockCollection);

      const results = await multiSourceSearch.search(query, 1);

      expect(results.rag).toHaveLength(1);
      expect(results.db).toHaveLength(0);
      expect(results.web).toHaveLength(0);

      // Verify only RAG search was called
      expect(vectorStore.searchVectors).toHaveBeenCalledTimes(1);
      expect(mongoClient.getProjectCollection).toHaveBeenCalledTimes(1); // Called only for RAG search at level 1
      expect(mockCollection.find).toHaveBeenCalledTimes(1); // Called once for RAG search
      expect(webSearch.contextSearch).not.toHaveBeenCalled();
    });

    it('should apply source-specific options', async () => {
      const query = {
        original: 'test query',
        context_queries: [],
        relationship_queries: [],
        temporal_queries: []
      };

      await multiSourceSearch.search(query, 4);

      expect(vectorStore.searchVectors).toHaveBeenCalledWith(
        'test-project',
        [0.1, 0.2, 0.3],
        7 // Level 4 increases K to 7
      );

      expect(mongoClient.getProjectCollection).toHaveBeenCalledWith('test-project');
    });
  });

  describe('contextSearch', () => {
    it('should perform context-aware search across sources', async () => {
      const query = {
        original: 'What happened?',
        context_queries: ['What happened in Smyrna in 1922?'],
        relationship_queries: ['Tell me about the Great Fire'],
        temporal_queries: ['Events in 1922']
      };

      // Mock vector store results
      vectorStore.searchVectors.mockResolvedValueOnce([{
        id: 'vec1',
        score: 0.9
      }]);

      // Mock MongoDB document retrieval for RAG search
      mongoClient.getProjectCollection().find().toArray.mockResolvedValueOnce([{
        vector_id: 'vec1',
        text: 'RAG content about 1922',
        type: 'document',
        title: 'Test Doc',
        time_period: '1922',
        locations: ['Smyrna'],
        events: ['Great Fire'],
        source_files: ['doc1.pdf']
      }]);

      // Mock MongoDB text search
      mongoClient.getProjectCollection().find().sort().limit().toArray.mockResolvedValueOnce([{
        text: 'DB content about Smyrna',
        type: 'document',
        title: 'Test Doc',
        score: 0.8
      }]);

      // Mock web search results
      webSearch.contextSearch.mockResolvedValueOnce([{
        title: 'Web Result',
        content: 'Web content about the Great Fire',
        url: 'http://example.com',
        score: 0.7,
        source: 'google'
      }]);

      const results = await multiSourceSearch.search(query, 4);

      expect(results.rag).toHaveLength(1);
      expect(results.db).toHaveLength(1);
      expect(results.web).toHaveLength(1);
    });

    it('should handle missing context fields', async () => {
      const query = {
        original: 'test query',
        context_queries: [],
        relationship_queries: [],
        temporal_queries: ['Events in 1922']
      };

      await multiSourceSearch.search(query, 4);

      expect(webSearch.contextSearch).toHaveBeenCalledWith(
        'Events in 1922',
        expect.any(Object)
      );
    });
  });
});