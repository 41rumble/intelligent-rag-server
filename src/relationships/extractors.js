/**
 * Find interactions between two characters in chapters
 * @param {string} char1 - First character name
 * @param {string} char2 - Second character name
 * @param {Array} chapters - Chapter data
 * @returns {Array} Timeline of interactions
 */
async function findInteractions(char1, char2, chapters) {
  const timeline = [];

  for (const chapter of chapters) {
    const text = chapter.text.toLowerCase();
    const char1Lower = char1.toLowerCase();
    const char2Lower = char2.toLowerCase();

    // Look for paragraphs where both characters appear
    const paragraphs = text.split('\n\n');
    
    for (const paragraph of paragraphs) {
      if (paragraph.includes(char1Lower) && paragraph.includes(char2Lower)) {
        // Extract the interaction context
        const context = extractInteractionContext(paragraph, char1Lower, char2Lower);
        
        if (context) {
          timeline.push({
            chapter: chapter.chapter_id,
            interaction: context,
            significance: determineSignificance(context)
          });
        }
      }
    }
  }

  return timeline;
}

/**
 * Analyze character co-occurrences in chapters
 * @param {Array} bios - Character bios
 * @param {Array} chapters - Chapter data
 * @returns {Array} Co-occurrence relationships
 */
async function analyzeCoOccurrences(bios, chapters) {
  const coOccurrences = new Map(); // Map of character pair -> occurrences

  for (const chapter of chapters) {
    const text = chapter.text.toLowerCase();
    
    // Check each character pair
    for (let i = 0; i < bios.length; i++) {
      for (let j = i + 1; j < bios.length; j++) {
        const char1 = bios[i].name.toLowerCase();
        const char2 = bios[j].name.toLowerCase();
        
        // Count paragraphs where both appear
        const paragraphs = text.split('\n\n');
        const coOccurrencesInChapter = paragraphs.filter(p => 
          p.includes(char1) && p.includes(char2)
        ).length;
        
        if (coOccurrencesInChapter > 0) {
          const key = `${bios[i].name}|${bios[j].name}`;
          const current = coOccurrences.get(key) || {
            count: 0,
            chapters: new Set()
          };
          
          current.count += coOccurrencesInChapter;
          current.chapters.add(chapter.chapter_id);
          coOccurrences.set(key, current);
        }
      }
    }
  }

  // Convert co-occurrences to relationships
  return Array.from(coOccurrences.entries()).map(([key, data]) => {
    const [char1, char2] = key.split('|');
    return {
      type: "character_relationship",
      source_character: char1,
      target_character: char2,
      relationship_type: "co-occurrence",
      strength: calculateCoOccurrenceStrength(data.count),
      timeline: Array.from(data.chapters).map(chapter => ({
        chapter,
        interaction: "Appeared together",
        significance: "medium"
      }))
    };
  });
}

/**
 * Group characters by time period
 * @param {Array} bios - Character bios
 * @returns {Object} Characters grouped by time period
 */
function groupByTimePeriod(bios) {
  const groups = {};

  for (const bio of bios) {
    if (bio.time_period) {
      if (!groups[bio.time_period]) {
        groups[bio.time_period] = [];
      }
      groups[bio.time_period].push(bio);
    }
  }

  return groups;
}

/**
 * Identify social groups within a time period
 * @param {Array} characters - Characters in the time period
 * @param {Array} chapters - Relevant chapters
 * @returns {Array} Identified social groups
 */
function identifySocialGroups(characters, chapters) {
  const groups = [];

  // 1. Find explicit group mentions
  const explicitGroups = findExplicitGroups(characters, chapters);
  groups.push(...explicitGroups);

  // 2. Find groups based on frequent interactions
  const interactionGroups = findInteractionGroups(characters, chapters);
  groups.push(...interactionGroups);

  // 3. Merge overlapping groups
  return mergeOverlappingGroups(groups);
}

/**
 * Extract themes from bios and chapters
 * @param {Array} bios - Character bios
 * @param {Array} chapters - Chapter data
 * @returns {Array} Extracted themes
 */
function extractThemes(bios, chapters) {
  const themes = new Set();

  // 1. Extract from bio tags
  bios.forEach(bio => {
    if (bio.tags) {
      bio.tags.forEach(tag => themes.add(tag));
    }
  });

  // 2. Extract from character arcs
  bios.forEach(bio => {
    if (bio.character_arc) {
      const arcThemes = extractThemesFromText(bio.character_arc);
      arcThemes.forEach(theme => themes.add(theme));
    }
  });

  // 3. Extract from chapter content
  chapters.forEach(chapter => {
    const chapterThemes = extractThemesFromText(chapter.text);
    chapterThemes.forEach(theme => themes.add(theme));
  });

  return Array.from(themes);
}

/**
 * Track theme development through chapters for a character
 * @param {Object} bio - Character bio
 * @param {string} theme - Theme to track
 * @param {Array} chapters - Chapter data
 * @returns {Array} Theme development timeline
 */
function trackThemeDevelopment(bio, theme, chapters) {
  const development = [];

  // Sort chapters by appearance
  const relevantChapters = chapters.filter(ch => 
    bio.source_files.includes(ch.chapter_id)
  ).sort((a, b) => 
    bio.source_files.indexOf(a.chapter_id) - bio.source_files.indexOf(b.chapter_id)
  );

  // Track theme through chapters
  for (const chapter of relevantChapters) {
    const themeContext = findThemeContext(bio.name, theme, chapter);
    if (themeContext) {
      development.push({
        chapter: chapter.chapter_id,
        description: themeContext
      });
    }
  }

  return development;
}

/**
 * Extract significant events from chapters
 * @param {Array} chapters - Chapter data
 * @returns {Array} Extracted events
 */
function extractEvents(chapters) {
  const events = [];

  for (const chapter of chapters) {
    // Look for event indicators in text
    const eventIndicators = findEventIndicators(chapter.text);
    
    for (const event of eventIndicators) {
      events.push({
        name: event.name,
        chapters: [chapter.chapter_id],
        context: event.context
      });
    }
  }

  // Merge related events across chapters
  return mergeRelatedEvents(events);
}

/**
 * Find character's involvement in an event
 * @param {Object} bio - Character bio
 * @param {Object} event - Event data
 * @param {Array} chapters - Chapter data
 * @returns {Object|null} Character's involvement
 */
function findCharacterInvolvement(bio, event, chapters) {
  // Check if character appears in event chapters
  const relevantChapters = chapters.filter(ch => 
    event.chapters.includes(ch.chapter_id)
  );

  let involvement = null;
  
  for (const chapter of relevantChapters) {
    const role = findCharacterRole(bio.name, event, chapter);
    if (role) {
      involvement = {
        role: role.type,
        impact: determineEventImpact(bio, event, chapter)
      };
      break;
    }
  }

  return involvement;
}

/**
 * Identify themes related to an event
 * @param {Object} event - Event data
 * @returns {Array} Related themes
 */
function identifyEventThemes(event) {
  const themes = new Set();

  // Extract themes from event name and context
  const nameThemes = extractThemesFromText(event.name);
  const contextThemes = extractThemesFromText(event.context);

  nameThemes.forEach(theme => themes.add(theme));
  contextThemes.forEach(theme => themes.add(theme));

  return Array.from(themes);
}

// Helper functions

function extractInteractionContext(paragraph, char1, char2) {
  // Simple context extraction - could be enhanced with NLP
  const sentences = paragraph.split(/[.!?]+/);
  return sentences.find(s => s.includes(char1) && s.includes(char2));
}

function determineSignificance(context) {
  const significantTerms = [
    'important', 'crucial', 'significant', 'major',
    'dramatic', 'pivotal', 'key', 'vital'
  ];

  if (significantTerms.some(term => context.includes(term))) {
    return 'high';
  }
  
  return 'medium';
}

function calculateCoOccurrenceStrength(count) {
  // Simple logarithmic scale: more occurrences = stronger relationship
  return Math.min(10, Math.ceil(Math.log2(count + 1)));
}

function findExplicitGroups(characters, chapters) {
  // Implementation would look for explicit group mentions in text
  return [];
}

function findInteractionGroups(characters, chapters) {
  // Implementation would cluster characters based on interaction frequency
  return [];
}

function mergeOverlappingGroups(groups) {
  // Implementation would merge groups with significant member overlap
  return groups;
}

function extractThemesFromText(text) {
  // Implementation would use NLP to identify themes
  return [];
}

function findThemeContext(character, theme, chapter) {
  // Implementation would find relevant theme development in chapter
  return null;
}

function findEventIndicators(text) {
  // Implementation would use NLP to identify significant events
  return [];
}

function mergeRelatedEvents(events) {
  // Implementation would merge events that are likely the same
  return events;
}

function findCharacterRole(character, event, chapter) {
  // Implementation would determine character's role in event
  return null;
}

function determineEventImpact(bio, event, chapter) {
  // Implementation would assess event's impact on character
  return 'medium';
}

module.exports = {
  findInteractions,
  analyzeCoOccurrences,
  groupByTimePeriod,
  identifySocialGroups,
  extractThemes,
  trackThemeDevelopment,
  extractEvents,
  findCharacterInvolvement,
  identifyEventThemes
};