const QueryExpander = require('../src/pipeline/services/queryExpander');

describe('QueryExpander', () => {
  let queryExpander;

  beforeEach(() => {
    queryExpander = new QueryExpander();
  });

  describe('extractEntities', () => {
    it('should extract time periods', () => {
      const query = 'What happened in 1922?';
      const entities = queryExpander.extractEntities(query);
      expect(entities.time).toBe('1922');
    });

    it('should extract locations', () => {
      const query = 'What happened in Smyrna?';
      const entities = queryExpander.extractEntities(query);
      expect(entities.location).toBe('Smyrna');
    });

    it('should extract events', () => {
      const query = 'Tell me about the Armenian Genocide';
      const entities = queryExpander.extractEntities(query);
      expect(entities.event).toBe('Armenian Genocide');
    });

    it('should extract people/groups', () => {
      const query = 'What happened to the Greeks?';
      const entities = queryExpander.extractEntities(query);
      expect(entities.person).toBe('Greeks');
    });
  });

  describe('generateContextQueries', () => {
    it('should generate context queries for time periods', () => {
      const query = 'What happened in 1922?';
      const queries = queryExpander.generateContextQueries(query);
      expect(queries).toContain('What was happening in the region during 1922?');
    });

    it('should generate context queries for locations', () => {
      const query = 'What happened in Smyrna?';
      const queries = queryExpander.generateContextQueries(query);
      expect(queries).toContain('What was the significance of Smyrna in this period?');
    });

    it('should generate context queries for events', () => {
      const query = 'Tell me about the Armenian Genocide';
      const queries = queryExpander.generateContextQueries(query);
      expect(queries).toContain('What led to Armenian Genocide?');
      expect(queries).toContain('What were the consequences of Armenian Genocide?');
    });
  });

  describe('generateTemporalQueries', () => {
    it('should generate temporal queries when time is specified', () => {
      const query = 'What happened in 1922?';
      const queries = queryExpander.generateTemporalQueries(query);
      expect(queries).toContain('What happened before 1922?');
      expect(queries).toContain('What happened after 1922?');
    });

    it('should generate general temporal queries when no time is specified', () => {
      const query = 'What happened in Smyrna?';
      const queries = queryExpander.generateTemporalQueries(query);
      expect(queries).toContain('When did these events take place?');
    });
  });

  describe('generateRelationshipQueries', () => {
    it('should generate relationship queries for person and location', () => {
      const query = 'What did the Greeks do in Smyrna?';
      const queries = queryExpander.generateRelationshipQueries(query);
      expect(queries).toContain('What was Greeks\'s connection to Smyrna?');
    });

    it('should generate relationship queries for location', () => {
      const query = 'What happened in Smyrna?';
      const queries = queryExpander.generateRelationshipQueries(query);
      expect(queries).toContain('What other locations were connected to events in Smyrna?');
    });
  });

  describe('expandQuery', () => {
    it('should return expanded query object with all query types', async () => {
      const query = 'What happened to the Greeks in Smyrna in 1922?';
      const expanded = await queryExpander.expandQuery(query);
      
      expect(expanded).toHaveProperty('original', query);
      expect(expanded).toHaveProperty('context_queries');
      expect(expanded).toHaveProperty('temporal_queries');
      expect(expanded).toHaveProperty('relationship_queries');
      
      expect(expanded.context_queries.length).toBeGreaterThan(0);
      expect(expanded.temporal_queries.length).toBeGreaterThan(0);
      expect(expanded.relationship_queries.length).toBeGreaterThan(0);
    });
  });
});