const QueryClassifier = require('../../src/pipeline/queryClassifier');
const { generateStructuredResponse } = require('../../src/utils/llmProvider');

jest.mock('../../src/utils/llmProvider');

describe('QueryClassifier', () => {
  let queryClassifier;

  beforeEach(() => {
    queryClassifier = new QueryClassifier();
    jest.clearAllMocks();
  });

  describe('classify', () => {
    it('should classify query and return structured response', async () => {
      const mockResponse = {
        type: 'factual',
        confidence: 0.9,
        reasoning: 'Query asks for specific factual information',
        required_sources: ['web', 'rag']
      };

      generateStructuredResponse.mockResolvedValueOnce(mockResponse);

      const result = await queryClassifier.classify('What happened in Smyrna in 1922?');

      expect(generateStructuredResponse).toHaveBeenCalledWith(
        expect.stringContaining('What happened in Smyrna in 1922?'),
        expect.any(Object)
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle LLM errors gracefully', async () => {
      generateStructuredResponse.mockRejectedValueOnce(new Error('LLM error'));

      const result = await queryClassifier.classify('What happened?');

      expect(result).toEqual({
        type: 'factual',
        confidence: 0.5,
        reasoning: 'Default classification due to error',
        required_sources: ['web', 'rag', 'db']
      });
    });

    it('should classify opinion-based queries', async () => {
      const mockResponse = {
        type: 'opinion',
        confidence: 0.8,
        reasoning: 'Query asks for subjective analysis',
        required_sources: ['rag', 'db']
      };

      generateStructuredResponse.mockResolvedValueOnce(mockResponse);

      const result = await queryClassifier.classify('What do you think about the events?');

      expect(result.type).toBe('opinion');
      expect(result.required_sources).toContain('rag');
    });

    it('should classify analytical queries', async () => {
      const mockResponse = {
        type: 'analytical',
        confidence: 0.95,
        reasoning: 'Query requires data analysis',
        required_sources: ['db', 'rag']
      };

      generateStructuredResponse.mockResolvedValueOnce(mockResponse);

      const result = await queryClassifier.classify('What patterns emerged from the events?');

      expect(result.type).toBe('analytical');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });
});