const express = require('express');
const logger = require('../utils/logger');
const { handlePipelineError } = require('../utils/errorHandler');
const { expandQuery } = require('../pipeline/queryExpander');
const { retrieveDocuments, bioSearch } = require('../pipeline/documentRetriever');
const { searchAndSummarize } = require('../pipeline/webSearch');
const { handleOversizedContext } = require('../pipeline/knowledgeCompressor');
const { buildFinalPrompt, generateFinalAnswer } = require('../pipeline/finalPromptBuilder');
const { extractEntities } = require('../pipeline/entityExtractor');

const router = express.Router();

/**
 * Process a query through the RAG pipeline:
 * 1. Expand query to find more relevant content
 * 2. Search documents with all queries
 * 3. Get relevant web content
 * 4. Process all context
 * 5. Generate final answer
 */
router.post('/', async (req, res) => {
  try {
    const { projectId, query } = req.body;
    
    if (!projectId || !query) {
      return res.status(400).json({
        error: 'Missing required parameters: projectId and query are required'
      });
    }

    logger.info('Starting query processing:', { projectId, query });

    // Step 1: Generate similar queries to expand search coverage
    const expandedQueries = await expandQuery(query, 3);
    logger.info('Generated similar queries:', { 
      original: query,
      expanded: expandedQueries,
      total: expandedQueries.length + 1 
    });

    // Step 1b: Extract entities for bio search
    const entities = await extractEntities(query);
    logger.info('Extracted entities:', {
      people: entities.people?.length || 0,
      places: entities.places?.length || 0,
      events: entities.events?.length || 0
    });

    // Step 2: Search documents with all queries
    const allQueries = [query, ...expandedQueries];
    const allDocuments = [];
    
    for (const q of allQueries) {
      const docs = await retrieveDocuments(q, { projectId }, 3);
      allDocuments.push(...docs);
    }

    // Deduplicate and sort by relevance
    const uniqueDocs = Array.from(
      new Map(allDocuments.map(doc => [doc._id, doc])).values()
    ).sort((a, b) => b.relevance - a.relevance)
     .slice(0, 5);

    logger.info('Retrieved relevant documents:', {
      total: allDocuments.length,
      unique: uniqueDocs.length,
      sources: uniqueDocs.map(d => d.source)
    });

    // Step 2b: Search for biographical information
    let bioResults = [];
    if (entities.people && entities.people.length > 0) {
      bioResults = await bioSearch(entities, projectId);
      logger.info('Bio search completed:', {
        people_searched: entities.people,
        bios_found: bioResults.length,
        bio_subjects: bioResults.map(bio => bio.name || bio._id)
      });
    }

    // Step 3: Get relevant web content with book context
    let webQuery = query;
    let bookMetadata = null;
    
    // Try to get book metadata for enhanced web search
    if (uniqueDocs.length > 0 && uniqueDocs[0].book_context) {
      bookMetadata = uniqueDocs[0].book_context;
      // Enhance web query with book context
      webQuery = `${query} "${bookMetadata.book_title}" ${bookMetadata.book_author} ${bookMetadata.time_period?.start || ''}`;
      logger.info('Enhanced web query with book context:', {
        original: query,
        enhanced: webQuery,
        book_title: bookMetadata.book_title,
        time_period: bookMetadata.time_period
      });
    } else {
      // Fallback to simple book context
      webQuery = `${query} book:"${projectId}"`;
    }
    
    const webResults = await searchAndSummarize(webQuery);
    logger.info('Web search completed', {
      hasResults: !!webResults,
      summaryLength: webResults?.summary?.length || 0,
      enhanced_query: webQuery
    });

    // Step 4: Prepare context with all sources (RAG + Bios + Web)
    let processedContext;
    try {
      // Combine RAG documents and bio results
      const allSources = [...uniqueDocs];
      
      // Add bio results as additional sources
      if (bioResults.length > 0) {
        bioResults.forEach(bio => {
          allSources.push({
            _id: bio._id,
            text: bio.text || bio.content || '',
            source: 'biography',
            relevance: 1.0, // High relevance since specifically requested
            type: 'bio',
            name: bio.name,
            metadata: {
              type: 'bio',
              character_name: bio.name,
              aliases: bio.aliases || []
            }
          });
        });
      }
      
      // Create a structure that preserves all the information
      processedContext = {
        compressed_text: '', // We'll let the final prompt builder handle this
        key_points: [],
        source_ids: allSources.map(doc => doc._id),
        source_snippets: allSources.map(doc => ({
          id: doc._id,
          text: doc.text || doc.content || '', // Full text, not compressed
          source: doc.source || 'book',
          relevance: doc.relevance || 1.0,
          type: doc.type,
          name: doc.name, // For bio sources
          metadata: doc.metadata || {}
        })),
        full_documents: allSources, // Pass all documents including bios
        bio_results: bioResults // Keep separate reference for debugging
      };

      logger.info('Context prepared with all sources:', {
        ragDocCount: uniqueDocs.length,
        bioCount: bioResults.length,
        totalSources: allSources.length,
        totalTextLength: allSources.reduce((sum, doc) => sum + (doc.text?.length || 0), 0),
        sourceTypes: allSources.map(doc => doc.type || doc.source),
        source_ids: processedContext.source_ids
      });
    } catch (error) {
      logger.warn('Error preparing context:', {
        error: error.message,
        uniqueDocs: uniqueDocs.length,
        hasWebResults: !!webResults
      });
      
      // Provide a valid structure even on error
      processedContext = {
        compressed_text: 'Failed to process context.',
        key_points: [],
        source_ids: [],
        source_snippets: [],
        error: error.message
      };
    }

    // Determine if this is a naval/military query
    const isNavalQuery = query.toLowerCase().includes('naval') ||
                        query.toLowerCase().includes('ship') ||
                        query.toLowerCase().includes('military') ||
                        query.toLowerCase().includes('war');

    // Look for temporal indicators
    const hasTimeContext = query.toLowerCase().includes('during') ||
                          query.toLowerCase().includes('after') ||
                          query.toLowerCase().includes('before') ||
                          query.toLowerCase().includes('when');

    // Check if query is about events outside the book
    const isExternalQuery = query.toLowerCase().includes('not related to') ||
                          query.toLowerCase().includes('other than') ||
                          query.toLowerCase().includes('outside of');

    logger.info('Query analysis:', {
      query,
      is_naval_query: isNavalQuery,
      has_time_context: hasTimeContext,
      is_external_query: isExternalQuery
    });

    // Step 5: Build final prompt and generate answer
    const queryInfo = {
      original_query: query,
      project_id: projectId,
      query_type: isNavalQuery ? 'Naval/Military History' : 'General',
      focus: isExternalQuery ? 'Information outside book context' : 'Book-related information'
    };

    // Build the final prompt using the proper function
    const promptResult = await buildFinalPrompt(
      queryInfo,
      processedContext,
      webResults,
      null // No evaluation info for now
    );
    
    const finalPrompt = promptResult.prompt;
    const sourceMapping = promptResult.sourceMapping || {};

    // Generate final answer with error handling
    let answer;
    try {
      answer = await generateFinalAnswer(finalPrompt);
      logger.info('Answer generated:', { 
        length: answer?.length || 0,
        has_citations: answer?.includes('[') || false,
        has_sources: answer?.includes('Sources:') || false
      });
    } catch (error) {
      logger.error('Error generating final answer:', {
        error: error.message,
        prompt_length: finalPrompt.length,
        has_context: processedContext.source_snippets.length > 0,
        has_web: !!webResults
      });

      // Provide a fallback answer
      answer = `I apologize, but I encountered an error while generating the answer. 

Here's what I know:
${webResults ? `- Found ${webResults.source_urls.length} relevant web sources about this topic` : '- No web sources found'}
${processedContext.source_snippets.length > 0 ? `- Found ${processedContext.source_snippets.length} relevant passages in the book` : '- No relevant book passages found'}

The error was: ${error.message}

Please try rephrasing your question or being more specific about what you'd like to know.`;
    }

    // Initialize empty arrays for snippets
    let formattedSnippets = [];
    let webSources = [];

    // Format response for logging
    const responseLog = {
      query,
      projectId,
      timestamp: new Date().toISOString(),
      steps: [
        {
          step: 'retrieve_documents',
          result: {
            total_documents: allDocuments.length,
            unique_documents: uniqueDocs.length,
            document_ids: uniqueDocs.map(doc => doc._id)
          }
        },
        {
          step: 'web_search',
          result: {
            has_results: !!webResults,
            summary_length: webResults?.summary?.length || 0,
            source_urls: webResults?.source_urls || []
          }
        },
        {
          step: 'compress_knowledge',
          result: {
            compressed_length: processedContext.compressed_text.length,
            key_points_count: processedContext.key_points.length,
            source_ids: processedContext.source_ids
          }
        },
        {
          step: 'generate_answer',
          result: {
            prompt_length: finalPrompt.length,
            answer_length: answer.length,
            context_sources: processedContext.source_ids,
            has_web_data: !!webResults
          }
        }
      ]
    };

    // Helper function to generate meaningful citation titles
    function generateCitationTitle(doc) {
      // Log the document structure for debugging
      logger.info('Generating citation title for doc:', {
        id: doc._id || doc.id,
        type: doc.type,
        source: doc.source,
        chapter_number: doc.chapter_number,
        chapter_id: doc.chapter_id,
        section_type: doc.section_type,
        name: doc.name,
        title: doc.title,
        character_name: doc.metadata?.character_name
      });
      
      // For biography sources (new integration)
      if (doc.source === 'biography' || doc.type === 'bio') {
        const name = doc.name || doc.metadata?.character_name || 'Character';
        return `${name}`;
      }
      
      // For chapter text documents
      if (doc.type === 'chapter_text' && doc.chapter_number) {
        return `Chapter ${doc.chapter_number}`;
      }
      
      // For chapter synopsis documents
      if (doc.type === 'chapter_synopsis') {
        if (doc.title) {
          return `${doc.title}`;
        } else if (doc.chapter_number) {
          return `Chapter ${doc.chapter_number} Synopsis`;
        }
        return 'Chapter Synopsis';
      }
      
      // For bio documents (legacy format)
      if (doc.type === 'bio' && doc.name) {
        return `${doc.name}`;
      }
      
      // For special sections
      if (doc.section_type) {
        const sectionName = doc.section_type.charAt(0).toUpperCase() + doc.section_type.slice(1);
        return sectionName;
      }
      
      // Extract chapter info from ID if available (fallback for chapter_text chunks)
      if (doc._id && doc._id.includes('chapter_')) {
        const chapterMatch = doc._id.match(/chapter_(\d+)/);
        if (chapterMatch) {
          return `Chapter ${chapterMatch[1]}`;
        }
        
        // Try alternative ID patterns like "TheGreatFire_chapter_01"
        const altChapterMatch = doc._id.match(/chapter_0*(\d+)/);
        if (altChapterMatch) {
          return `Chapter ${parseInt(altChapterMatch[1])}`;
        }
      }
      
      // Try chapter_id field if available
      if (doc.chapter_id) {
        const chapterMatch = doc.chapter_id.match(/chapter_0*(\d+)/);
        if (chapterMatch) {
          return `Chapter ${parseInt(chapterMatch[1])}`;
        }
      }
      
      // Web sources
      if (doc.source === 'web' && doc.title) {
        return doc.title;
      }
      
      // Fallback to source ID but keep it readable
      return doc._id || doc.id || 'Source';
    }

    // Create a map of all sources by their original IDs
    const allSourcesById = new Map();
    
    // Add book sources with meaningful titles
    processedContext.source_snippets.forEach(snippet => {
      // Get the full document for context if available
      const fullDoc = processedContext.full_documents?.find(doc => doc._id === snippet.id) || snippet;
      
      allSourcesById.set(snippet.id, {
        id: snippet.id,
        text: snippet.text,
        source: snippet.source,
        title: generateCitationTitle(fullDoc),
        relevance: snippet.relevance || 1.0,
        metadata: {
          type: snippet.type || 'text',
          chapter: snippet.chapter || fullDoc.chapter_number || null,
          page: snippet.page || null
        }
      });
    });
    
    // Add web sources
    if (webResults && webResults.source_urls) {
      webResults.source_urls.forEach(url => {
        allSourcesById.set(url.id, {
          id: url.id,
          text: url.url || url,
          source: 'web',
          title: url.title || 'Web Source',
          relevance: url.relevance_score || 1.0,
          metadata: {
            type: 'web',
            url: url.url || url,
            title: url.title || null,
            relevance_score: url.relevance_score
          }
        });
      });
    }
    
    // Create source_snippets array in citation order
    const maxCitation = Math.max(...Object.values(sourceMapping).map(n => parseInt(n)), 0);
    const orderedSnippets = [];
    
    // Build the array in citation order [1], [2], [3], etc.
    for (let i = 1; i <= maxCitation; i++) {
      // Find which source ID maps to this citation number
      const sourceId = Object.keys(sourceMapping).find(id => sourceMapping[id] === i);
      if (sourceId && allSourcesById.has(sourceId)) {
        orderedSnippets.push(allSourcesById.get(sourceId));
      }
    }
    
    // Log the mapping for debugging
    logger.info('Source citation mapping:', {
      mapping: sourceMapping,
      total_citations: maxCitation,
      ordered_count: orderedSnippets.length
    });

    // Log the formatted response
    logger.info('\n=== Query Response ===\n' +
      `Query: "${query}"\n\n` +
      `Answer: ${answer}\n\n` +
      '=== Source Snippets ===\n' +
      orderedSnippets
        .map((snippet, index) => 
          `[${index + 1}] (was ${snippet.id})\n` +
          `Text: ${snippet.text}\n` +
          `Relevance: ${snippet.relevance}\n`
        ).join('\n') +
      '\n=== Pipeline Steps ===\n' +
      responseLog.steps
        .map(step => 
          `${step.step}:\n${JSON.stringify(step.result, null, 2)}\n`
        ).join('\n')
    );

    // Return response
    return res.json({
      answer: answer.trim(),
      source_snippets: orderedSnippets,
      log: responseLog
    });
  } catch (error) {
    // Only include variables that are defined
    const errorContext = {
      query: req.body?.query,
      projectId: req.body?.projectId
    };

    // Add optional context if available
    if (typeof expandedQueries !== 'undefined') errorContext.expandedQueries = expandedQueries;
    if (typeof uniqueDocs !== 'undefined') errorContext.uniqueDocs = uniqueDocs;
    if (typeof webResults !== 'undefined') errorContext.webResults = webResults;
    if (typeof processedContext !== 'undefined') errorContext.processedContext = processedContext;

    const errorResponse = handlePipelineError(error, errorContext);
    return res.status(500).json(errorResponse);
  }
});

module.exports = router;