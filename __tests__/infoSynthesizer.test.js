const InfoSynthesizer = require('../src/pipeline/services/infoSynthesizer');
const { generateStructuredResponse } = require('../src/utils/llmProvider');

jest.mock('../src/utils/llmProvider');

describe('InfoSynthesizer', () => {
  let infoSynthesizer;
  const mockSearchResults = {
    rag: [
      {
        source: 'rag',
        score: 0.8,
        content: 'Test content 1',
        metadata: {
          events: [
            { event: 'Event 1', significance: 'Important event' },
            'Simple Event'
          ],
          time_period: '1922'
        }
      }
    ],
    db: [
      {
        source: 'db',
        score: 0.9,
        content: 'Test content 2',
        metadata: {
          events: ['Event 2'],
          relationships: {
            'Person A': 'Connected to Person B',
            'Location X': 'Site of Event Y'
          }
        }
      }
    ],
    web: [
      {
        source: 'web',
        score: 0.7,
        content: 'Test content 3',
        metadata: {
          title: 'Web Result',
          keyPoints: ['Key Point 1', 'Key Point 2']
        }
      }
    ]
  };

  beforeEach(() => {
    infoSynthesizer = new InfoSynthesizer();
    jest.clearAllMocks();
  });

  describe('extractKeyPoints', () => {
    it('should extract key points from all sources', () => {
      const points = infoSynthesizer.extractKeyPoints(mockSearchResults);
      expect(points).toContain('Event 1');
      expect(points).toContain('Simple Event');
      expect(points).toContain('Event 2');
    });

    it('should handle missing metadata', () => {
      const results = {
        rag: [{ source: 'rag', content: 'Test', metadata: {} }],
        db: [],
        web: []
      };
      const points = infoSynthesizer.extractKeyPoints(results);
      expect(points).toHaveLength(0);
    });
  });

  describe('buildTimeline', () => {
    it('should build timeline from events', () => {
      const timeline = infoSynthesizer.buildTimeline(mockSearchResults);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].date).toBe('1922');
      expect(timeline[0].events).toContain('Event 1');
    });

    it('should handle events without dates', () => {
      const results = {
        rag: [{
          source: 'rag',
          metadata: {
            events: ['Undated Event']
          }
        }],
        db: [],
        web: []
      };
      const timeline = infoSynthesizer.buildTimeline(results);
      expect(timeline).toHaveLength(0);
    });
  });

  describe('mapRelationships', () => {
    it('should map relationships from search results', () => {
      const relationships = infoSynthesizer.mapRelationships(mockSearchResults);
      expect(relationships).toHaveLength(2);
      
      const relationshipMap = new Map(
        relationships.map(r => [r.entities.sort().join('::'), r])
      );

      expect(relationshipMap.has('Location X::Person A')).toBe(true);
      expect(relationshipMap.get('Location X::Person A').descriptions)
        .toContain('Connected to Person B');
    });

    it('should handle missing relationships', () => {
      const results = {
        rag: [{ source: 'rag', metadata: {} }],
        db: [],
        web: []
      };
      const relationships = infoSynthesizer.mapRelationships(results);
      expect(relationships).toHaveLength(0);
    });
  });

  describe('synthesize', () => {
    it('should synthesize information at level 1', async () => {
      const synthesized = await infoSynthesizer.synthesize(mockSearchResults, 1);
      expect(synthesized).toHaveProperty('keyPoints');
      expect(synthesized).toHaveProperty('timeline');
      expect(synthesized).toHaveProperty('relationships');
      expect(synthesized).not.toHaveProperty('summary');
    });

    it('should include summary at level 3', async () => {
      generateStructuredResponse.mockResolvedValueOnce({
        summary: 'Test summary',
        key_findings: ['Finding 1'],
        implications: 'Test implications',
        confidence: 0.8
      });

      const synthesized = await infoSynthesizer.synthesize(mockSearchResults, 3);
      expect(synthesized).toHaveProperty('summary');
      expect(synthesized.summary).toHaveProperty('summary', 'Test summary');
    });

    it('should handle empty search results', async () => {
      const emptyResults = { rag: [], db: [], web: [] };
      const synthesized = await infoSynthesizer.synthesize(emptyResults, 1);
      expect(synthesized.keyPoints).toHaveLength(0);
      expect(synthesized.timeline).toHaveLength(0);
      expect(synthesized.relationships).toHaveLength(0);
    });
  });
});