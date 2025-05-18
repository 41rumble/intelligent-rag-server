const MultiSourceSearch = require('../../../src/pipeline/services/multiSourceSearch');
const { searchDocuments } = require('../../../src/utils/vectorStore');
const { searchCollection } = require('../../../src/utils/mongoClient');
const webSearch = require('../../../src/utils/webSearch');

jest.mock('../../../src/utils/vectorStore');
jest.mock('../../../src/utils/mongoClient');
jest.mock('../../../src/utils/webSearch');

describe('MultiSourceSearch', () => {
  let multiSourceSearch;

  beforeEach(() => {
    multiSourceSearch = new MultiSourceSearch();
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should search all sources and combine results', async () => {
      // Mock vector store results
      searchDocuments.mockResolvedValueOnce([{
        content: 'RAG content',
        metadata: { source: 'document1.pdf' },
        score: 0.9
      }]);

      // Mock MongoDB results
      searchCollection.mockResolvedValueOnce([{
        content: 'DB content',
        metadata: { source: 'collection1' },
        score: 0.8
      }]);

      // Mock web search results
      webSearch.search.mockResolvedValueOnce([{
        title: 'Web Result',
        content: 'Web content',
        url: 'http://example.com',
        score: 0.7
      }]);

      const query = 'test query';
      const sources = ['rag', 'db', 'web'];
      const results = await multiSourceSearch.search(query, { sources });

      expect(results).toHaveProperty('rag');
      expect(results).toHaveProperty('db');
      expect(results).toHaveProperty('web');

      expect(results.rag).toHaveLength(1);
      expect(results.db).toHaveLength(1);
      expect(results.web).toHaveLength(1);

      expect(searchDocuments).toHaveBeenCalledWith(query, expect.any(Object));
      expect(searchCollection).toHaveBeenCalledWith(expect.any(String), query, expect.any(Object));
      expect(webSearch.search).toHaveBeenCalledWith(query, expect.any(Object));
    });

    it('should handle errors from individual sources', async () => {
      // Mock error from vector store
      searchDocuments.mockRejectedValueOnce(new Error('RAG error'));

      // Mock successful results from other sources
      searchCollection.mockResolvedValueOnce([{
        content: 'DB content',
        metadata: { source: 'collection1' },
        score: 0.8
      }]);

      webSearch.search.mockResolvedValueOnce([{
        title: 'Web Result',
        content: 'Web content',
        url: 'http://example.com',
        score: 0.7
      }]);

      const results = await multiSourceSearch.search('test query', {
        sources: ['rag', 'db', 'web']
      });

      expect(results.rag).toHaveLength(0);
      expect(results.db).toHaveLength(1);
      expect(results.web).toHaveLength(1);
    });

    it('should respect source selection', async () => {
      const results = await multiSourceSearch.search('test query', {
        sources: ['web']
      });

      expect(searchDocuments).not.toHaveBeenCalled();
      expect(searchCollection).not.toHaveBeenCalled();
      expect(webSearch.search).toHaveBeenCalled();
    });

    it('should apply source-specific options', async () => {
      const options = {
        sources: ['rag', 'db'],
        rag: { limit: 5 },
        db: { collection: 'testCollection' }
      };

      await multiSourceSearch.search('test query', options);

      expect(searchDocuments).toHaveBeenCalledWith('test query', 
        expect.objectContaining({ limit: 5 })
      );

      expect(searchCollection).toHaveBeenCalledWith(
        'testCollection',
        'test query',
        expect.any(Object)
      );
    });
  });

  describe('contextSearch', () => {
    it('should perform context-aware search across sources', async () => {
      const context = {
        time_period: '1922',
        locations: ['Smyrna'],
        events: ['Great Fire']
      };

      // Mock successful results from all sources
      searchDocuments.mockResolvedValueOnce([{
        content: 'RAG content about 1922',
        metadata: { source: 'document1.pdf' },
        score: 0.9
      }]);

      searchCollection.mockResolvedValueOnce([{
        content: 'DB content about Smyrna',
        metadata: { source: 'collection1' },
        score: 0.8
      }]);

      webSearch.contextSearch.mockResolvedValueOnce([{
        title: 'Web Result',
        content: 'Web content about the Great Fire',
        url: 'http://example.com',
        score: 0.7
      }]);

      const results = await multiSourceSearch.contextSearch('What happened?', context, {
        sources: ['rag', 'db', 'web']
      });

      expect(results).toHaveProperty('rag');
      expect(results).toHaveProperty('db');
      expect(results).toHaveProperty('web');

      expect(webSearch.contextSearch).toHaveBeenCalledWith(
        'What happened?',
        expect.objectContaining(context)
      );
    });

    it('should handle missing context fields', async () => {
      const context = { time_period: '1922' }; // Only time period provided

      await multiSourceSearch.contextSearch('test query', context, {
        sources: ['web']
      });

      expect(webSearch.contextSearch).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({ time_period: '1922' })
      );
    });
  });
});