const axios = require('axios');
const webSearch = require('../src/utils/webSearch');

jest.mock('axios');

describe('WebSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Default mock implementation
  const mockSearchResponse = {
    data: {
      results: [{
        title: 'Test Result',
        url: 'http://example.com',
        content: 'Test content with more than 50 characters to pass the filter',
        engine: 'test_engine',
        score: 1.0
      }]
    }
  };

  describe('cleanResult', () => {
    it('should clean and format search results', () => {
      const rawResult = {
        title: 'Test Title',
        url: 'http://example.com',
        content: 'Test content',
        engine: 'test_engine',
        publishedDate: '2023-01-01',
        score: 0.8
      };

      const cleaned = webSearch.cleanResult(rawResult);
      
      expect(cleaned).toEqual({
        title: 'Test Title',
        url: 'http://example.com',
        content: 'Test content',
        source: 'test_engine',
        date: '2023-01-01',
        score: 0.8
      });
    });

    it('should provide default score if missing', () => {
      const rawResult = {
        title: 'Test Title',
        url: 'http://example.com',
        content: 'Test content',
        engine: 'test_engine'
      };

      const cleaned = webSearch.cleanResult(rawResult);
      expect(cleaned.score).toBe(1.0);
    });
  });

  describe('search', () => {
    it('should perform search with correct parameters', async () => {
      axios.get.mockResolvedValueOnce(mockSearchResponse);

      const results = await webSearch.search('test query');

      expect(axios.get).toHaveBeenCalledWith(
        'http://localhost:8880/search',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'test query',
            format: 'json',
            engines: expect.arrayContaining(['wikipedia', 'wikidata', 'google', 'bing']),
            language: 'en'
          })
        })
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('title', 'Test Result');
    });

    it('should handle empty results', async () => {
      axios.get.mockResolvedValueOnce({ data: { results: [] } });
      const results = await webSearch.search('test query');
      expect(results).toHaveLength(0);
    });

    it('should handle errors', async () => {
      axios.get.mockRejectedValueOnce(new Error('Search failed'));
      const results = await webSearch.search('test query');
      expect(results).toHaveLength(0);
    });
  });

  describe('multiSearch', () => {
    it('should aggregate results from multiple queries', async () => {
      const mockResponse1 = {
        data: {
          results: [{
            title: 'Result 1',
            url: 'http://example.com/1',
            content: 'Content 1 with more than 50 characters to pass the content filter',
            engine: 'test_engine'
          }]
        }
      };

      const mockResponse2 = {
        data: {
          results: [{
            title: 'Result 2',
            url: 'http://example.com/2',
            content: 'Content 2 with more than 50 characters to pass the content filter',
            engine: 'test_engine'
          }]
        }
      };

      axios.get
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const results = await webSearch.multiSearch(['query1', 'query2']);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Result 1');
      expect(results[1].title).toBe('Result 2');
    });

    it('should remove duplicate results', async () => {
      const mockResponse1 = {
        data: {
          results: [{
            title: 'Result 1',
            url: 'http://example.com/1',
            content: 'Content 1 with more than 50 characters to pass the content filter',
            engine: 'test_engine'
          }]
        }
      };

      const mockResponse2 = {
        data: {
          results: [{
            title: 'Result 1',
            url: 'http://example.com/1',
            content: 'Content 1 with more than 50 characters to pass the content filter',
            engine: 'other_engine'
          }]
        }
      };

      axios.get
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const results = await webSearch.multiSearch(['query1', 'query2']);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Result 1');
    });
  });

  describe('contextSearch', () => {
    it('should generate context-aware queries', async () => {
      const context = {
        time_period: '1922',
        locations: ['Smyrna'],
        events: ['Great Fire']
      };

      const mockResponse = {
        data: {
          results: [{
            title: 'Test Result',
            url: 'http://example.com',
            content: 'Test content with more than 50 characters to pass the content filter',
            engine: 'test_engine'
          }]
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const results = await webSearch.contextSearch('What happened?', context);

      expect(axios.get).toHaveBeenCalledTimes(4); // Original + 3 context queries
      expect(results).toHaveLength(1);
    });
  });
});