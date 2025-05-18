const { classifyQuery } = require('../../src/pipeline/queryClassifier');
const { generateStructuredResponse } = require('../../src/utils/llmProvider');

jest.mock('../../src/utils/llmProvider');

describe('queryClassifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('classifyQuery', () => {
    it('should classify query and return structured response', async () => {
      const mockResponse = {
        people: ['Greeks', 'Turks'],
        locations: ['Smyrna'],
        time_periods: ['1922'],
        topics: ['Great Fire', 'evacuation'],
        query_type: 'factual',
        query_complexity: 7
      };

      generateStructuredResponse.mockResolvedValueOnce(mockResponse);

      const result = await classifyQuery('What happened in Smyrna in 1922?', 'test-project');

      expect(generateStructuredResponse).toHaveBeenCalledWith(
        expect.stringContaining('What happened in Smyrna in 1922?'),
        expect.any(Object)
      );

      expect(result).toEqual({
        ...mockResponse,
        original_query: 'What happened in Smyrna in 1922?',
        project_id: 'test-project'
      });
    });

    it('should handle LLM errors gracefully', async () => {
      generateStructuredResponse.mockRejectedValueOnce(new Error('LLM error'));

      const result = await classifyQuery('What happened?', 'test-project');

      expect(result).toEqual({
        people: [],
        locations: [],
        time_periods: [],
        topics: [],
        query_type: 'unknown',
        query_complexity: 5,
        original_query: 'What happened?',
        project_id: 'test-project'
      });
    });

    it('should classify opinion-based queries', async () => {
      const mockResponse = {
        people: [],
        locations: ['Smyrna'],
        time_periods: ['1922'],
        topics: ['historical analysis', 'impact'],
        query_type: 'analytical',
        query_complexity: 8
      };

      generateStructuredResponse.mockResolvedValueOnce(mockResponse);

      const result = await classifyQuery('What do you think about the events?', 'test-project');

      expect(result.query_type).toBe('analytical');
      expect(result.query_complexity).toBeGreaterThan(5);
    });

    it('should classify analytical queries', async () => {
      const mockResponse = {
        people: [],
        locations: ['Smyrna', 'Asia Minor'],
        time_periods: ['1922-1923'],
        topics: ['patterns', 'historical trends'],
        query_type: 'analytical',
        query_complexity: 9
      };

      generateStructuredResponse.mockResolvedValueOnce(mockResponse);

      const result = await classifyQuery('What patterns emerged from the events?', 'test-project');

      expect(result.query_type).toBe('analytical');
      expect(result.query_complexity).toBeGreaterThan(5);
    });
  });
});