const PipelineController = require('../src/pipeline/controllers/pipelineController');
const QueryExpander = require('../src/pipeline/services/queryExpander');
const MultiSourceSearch = require('../src/pipeline/services/multiSourceSearch');
const InfoSynthesizer = require('../src/pipeline/services/infoSynthesizer');
const { generateStructuredResponse } = require('../src/utils/llmProvider');

jest.mock('../src/pipeline/services/queryExpander');
jest.mock('../src/pipeline/services/multiSourceSearch');
jest.mock('../src/pipeline/services/infoSynthesizer');
jest.mock('../src/utils/llmProvider');

describe('PipelineController', () => {
  let pipelineController;
  const projectId = 'test_project';
  
  const mockExpandedQuery = {
    original: 'test query',
    context_queries: ['context query 1'],
    temporal_queries: ['temporal query 1'],
    relationship_queries: ['relationship query 1']
  };

  const mockSearchResults = {
    rag: [{ source: 'rag', content: 'rag content' }],
    db: [{ source: 'db', content: 'db content' }],
    web: [{ source: 'web', content: 'web content' }]
  };

  const mockSynthesized = {
    keyPoints: ['point 1'],
    timeline: [{ date: '1922', events: ['event 1'] }],
    relationships: [{ entities: ['A', 'B'], descriptions: ['related'] }]
  };

  const mockAnswer = {
    answer: 'Test answer',
    key_points: ['key point 1'],
    sources: ['source 1'],
    confidence: 0.8,
    follow_up: ['follow up 1']
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mocks
    QueryExpander.prototype.expandQuery = jest.fn().mockResolvedValue(mockExpandedQuery);
    MultiSourceSearch.prototype.search = jest.fn().mockResolvedValue(mockSearchResults);
    InfoSynthesizer.prototype.synthesize = jest.fn().mockResolvedValue(mockSynthesized);
    generateStructuredResponse.mockResolvedValue(mockAnswer);

    pipelineController = new PipelineController(projectId);
  });

  describe('process', () => {
    it('should process query at thinking depth 1', async () => {
      const result = await pipelineController.process('test query', 1);

      expect(QueryExpander.prototype.expandQuery).toHaveBeenCalledWith('test query');
      expect(MultiSourceSearch.prototype.search).toHaveBeenCalledWith(
        mockExpandedQuery,
        1
      );
      expect(InfoSynthesizer.prototype.synthesize).toHaveBeenCalledWith(
        mockSearchResults,
        1
      );

      expect(result).toHaveProperty('answer', mockAnswer);
      expect(result).toHaveProperty('supporting_info', mockSynthesized);
      expect(result.metadata.thinking_depth).toBe(1);
    });

    it('should process query at thinking depth 4', async () => {
      const result = await pipelineController.process('test query', 4);

      expect(MultiSourceSearch.prototype.search).toHaveBeenCalledWith(
        mockExpandedQuery,
        4
      );
      expect(InfoSynthesizer.prototype.synthesize).toHaveBeenCalledWith(
        mockSearchResults,
        4
      );

      expect(result.metadata.thinking_depth).toBe(4);
    });

    it('should handle errors gracefully', async () => {
      QueryExpander.prototype.expandQuery.mockRejectedValueOnce(new Error('Test error'));

      await expect(pipelineController.process('test query'))
        .rejects
        .toThrow('Test error');
    });
  });

  describe('generateAnswer', () => {
    it('should generate structured answer', async () => {
      const answer = await pipelineController.generateAnswer(
        'test query',
        mockExpandedQuery,
        mockSynthesized,
        1
      );

      expect(generateStructuredResponse).toHaveBeenCalled();
      expect(answer).toEqual(mockAnswer);
    });

    it('should include summary in prompt when available', async () => {
      const synthesizedWithSummary = {
        ...mockSynthesized,
        summary: { summary: 'test summary' }
      };

      await pipelineController.generateAnswer(
        'test query',
        mockExpandedQuery,
        synthesizedWithSummary,
        3
      );

      expect(generateStructuredResponse).toHaveBeenCalledWith(
        expect.stringContaining('test summary'),
        expect.any(Object)
      );
    });
  });
});