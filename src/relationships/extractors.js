const logger = require('../utils/logger');
const { generateStructuredResponse } = require('../utils/llmProvider');

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
async function analyzeCoOccurrences(char1Name, char2Name, chapters) {
  if (!chapters || !Array.isArray(chapters)) {
    logger.warn(`Invalid chapters data for ${char1Name} and ${char2Name}`);
    return null;
  }

  const char1Lower = char1Name.toLowerCase();
  const char2Lower = char2Name.toLowerCase();

  // Collect all relevant paragraphs
  const relevantParagraphs = [];
  for (const chapter of chapters) {
    if (!chapter || !chapter.text) {
      logger.warn(`Invalid chapter data in analyzeCoOccurrences`);
      continue;
    }

    const paragraphs = chapter.text.split('\n\n');
    const sharedParagraphs = paragraphs.filter(p => 
      p.toLowerCase().includes(char1Lower) && 
      p.toLowerCase().includes(char2Lower)
    );

    if (sharedParagraphs.length > 0) {
      relevantParagraphs.push(...sharedParagraphs.map(p => ({
        text: p,
        chapter: chapter.chapter_id
      })));
    }
  }

  if (relevantParagraphs.length === 0) {
    logger.info(`No shared paragraphs found between ${char1Name} and ${char2Name}`);
    return null;
  }

  // Log the data we're working with
  logger.info(`Analyzing relationship between ${char1Name} and ${char2Name}`);
  logger.info(`Found ${relevantParagraphs.length} paragraphs with both characters`);
  
  // Log a sample of the paragraphs
  if (relevantParagraphs.length > 0) {
    logger.info('Sample paragraph:', relevantParagraphs[0].text.substring(0, 200));
  }

  // Analyze relationship using LLM
  try {
    const prompt = `You are a relationship analysis system. Your task is to analyze the relationship between two characters based on their interactions. You must respond with ONLY valid JSON, no other text.

CHARACTERS:
- Character 1: ${char1Name}
- Character 2: ${char2Name}

INTERACTIONS:
${relevantParagraphs.map(p => `[Chapter ${p.chapter}]: ${p.text}`).join('\n\n')}

RESPONSE FORMAT:
{
  "relationship": {
    "type": "friendly" | "hostile" | "professional" | "neutral" | "complex",
    "sentiment": <number between -1 and 1>,
    "power_dynamic": "equal" | "${char1Name}_dominant" | "${char2Name}_dominant",
    "key_patterns": {
      "interaction_types": ["<type1>", "<type2>", ...],
      "recurring_themes": ["<theme1>", "<theme2>", ...],
      "significant_events": ["<event1>", "<event2>", ...]
    },
    "confidence": <number between 0 and 1>
  }
}

RULES:
1. Respond with ONLY the JSON object, no other text
2. All fields are required
3. Arrays must have at least one item
4. Numbers must be within specified ranges
5. Do not use backticks, markdown, or code blocks`;

    const analysis = await generateStructuredResponse(prompt);
    logger.info(`Generated relationship analysis between ${char1Name} and ${char2Name}`);

    return {
      total_scenes: relevantParagraphs.length,
      chapters: new Set(relevantParagraphs.map(p => p.chapter)),
      analysis: analysis.relationship
    };
  } catch (error) {
    logger.error(`Failed to analyze relationship between ${char1Name} and ${char2Name}: ${error.message}`);
    return null;
  }


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

async function extractInteractionContext(paragraph, char1, char2) {
  try {
    const prompt = `
Analyze the interaction between ${char1} and ${char2} in this text:
${paragraph}

Consider:
1. Type of interaction (friendly, hostile, professional, romantic, familial, neutral, complex)
2. Emotional sentiment (-1 to 1)
3. Power dynamics between them
4. Key observations about their interaction
5. Your confidence in this analysis (0 to 1)

Return ONLY valid JSON with these fields:
{
  "interaction_type": string,
  "sentiment": number,
  "power_dynamic": "equal" | "char1_dominant" | "char2_dominant" | "unclear",
  "key_observations": string[],
  "confidence": number
}`;

    const analysis = await generateStructuredResponse(prompt);
    return {
      type: analysis.interaction_type,
      sentiment: analysis.sentiment,
      power_dynamic: analysis.power_dynamic,
      observations: analysis.key_observations,
      confidence: analysis.confidence,
      text: paragraph
    };
  } catch (error) {
    logger.error(`Failed to analyze interaction: ${error.message}`);
    // Fallback to basic extraction
    return {
      type: 'unknown',
      sentiment: 0,
      power_dynamic: 'unclear',
      observations: [],
      confidence: 0.1,
      text: paragraph
    };
  }
}

function determineSignificance(context) {
  // Use sentiment and confidence from Ollama analysis
  const sentimentWeight = Math.abs(context.sentiment);
  const confidenceBoost = context.confidence;
  const score = (sentimentWeight + confidenceBoost) / 2;

  if (score > 0.7) return 'high';
  if (score > 0.4) return 'medium';
  return 'low';
}

function calculateCoOccurrenceStrength(count, interactions) {
  // Combine frequency with interaction quality
  const baseStrength = Math.min(10, Math.ceil(Math.log2(count + 1)));
  
  if (!interactions || interactions.length === 0) {
    return baseStrength;
  }

  // Average sentiment impact
  const avgSentiment = interactions.reduce((sum, i) => sum + Math.abs(i.sentiment), 0) / interactions.length;
  
  // Adjust base strength by sentiment
  return Math.min(10, baseStrength * (1 + avgSentiment));
}

async function findExplicitGroups(characters, chapters) {
  const groups = [];
  
  for (const chapter of chapters) {
    try {
      const prompt = `
Analyze the social dynamics between these characters in the following text:
Characters: ${characters.map(c => c.name).join(', ')}

Text:
${chapter.text}

Return ONLY valid JSON with this structure:
{
  "group_type": "family" | "friends" | "allies" | "rivals" | "mixed" | "other",
  "power_structure": {
    "leaders": string[],
    "followers": string[],
    "independent": string[]
  },
  "subgroups": [
    {
      "members": string[],
      "bond_type": string
    }
  ],
  "tensions": [
    {
      "parties": string[],
      "cause": string
    }
  ]
}`;

      const dynamics = await generateStructuredResponse(prompt);
      
      if (dynamics.group_type !== 'other') {
        groups.push({
          name: `${dynamics.group_type} group`,
          type: dynamics.group_type,
          members: characters.filter(c => 
            dynamics.power_structure.leaders.includes(c.name) ||
            dynamics.power_structure.followers.includes(c.name)
          ),
          structure: dynamics.power_structure,
          tensions: dynamics.tensions
        });
      }

      // Add subgroups
      groups.push(...dynamics.subgroups.map(sg => ({
        name: `${sg.bond_type} group`,
        type: sg.bond_type,
        members: characters.filter(c => sg.members.includes(c.name))
      })));
    } catch (error) {
      logger.error(`Failed to analyze social dynamics in chapter: ${error.message}`);
    }
  }

  return groups;
}

async function findInteractionGroups(characters, chapters) {
  // Create interaction matrix
  const interactions = new Map();
  
  for (const char1 of characters) {
    for (const char2 of characters) {
      if (char1.name !== char2.name) {
        const key = [char1.name, char2.name].sort().join('|');
        if (!interactions.has(key)) {
          const sharedChapters = chapters.filter(ch =>
            ch.text.toLowerCase().includes(char1.name.toLowerCase()) &&
            ch.text.toLowerCase().includes(char2.name.toLowerCase())
          );
          
          if (sharedChapters.length > 0) {
            try {
              const analysis = await analyzeRelationship(MODEL, 
                sharedChapters.map(ch => ch.text).join('\n'),
                char1.name,
                char2.name
              );
              interactions.set(key, {
                type: analysis.interaction_type,
                strength: analysis.sentiment
              });
            } catch (error) {
              logger.error(`Failed to analyze relationship: ${error.message}`);
            }
          }
        }
      }
    }
  }

  // Group characters with strong positive interactions
  const groups = [];
  const processed = new Set();

  for (const [key, interaction] of interactions.entries()) {
    if (interaction.type === 'friendly' && interaction.strength > 0.5) {
      const [char1, char2] = key.split('|');
      if (!processed.has(char1) && !processed.has(char2)) {
        const group = {
          name: 'Allied group',
          type: 'alliance',
          members: characters.filter(c => c.name === char1 || c.name === char2)
        };
        groups.push(group);
        processed.add(char1);
        processed.add(char2);
      }
    }
  }

  return groups;
}

function mergeOverlappingGroups(groups) {
  const merged = [...groups];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const group1 = merged[i];
        const group2 = merged[j];
        
        // Check member overlap
        const overlap = group1.members.filter(m1 => 
          group2.members.some(m2 => m1.name === m2.name)
        ).length;
        
        const overlapRatio = overlap / Math.min(group1.members.length, group2.members.length);
        
        if (overlapRatio > 0.5) {
          // Merge groups
          merged[i] = {
            name: `${group1.type}/${group2.type} group`,
            type: 'mixed',
            members: [...new Set([...group1.members, ...group2.members])]
          };
          merged.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return merged;
}

async function extractThemesFromText(text) {
  try {
    const prompt = `
Analyze this text and identify major themes and recurring motifs:
${text}

Return ONLY valid JSON with this structure:
{
  "major_themes": [
    {
      "name": string,
      "description": string,
      "evidence": string[]
    }
  ],
  "motifs": [
    {
      "symbol": string,
      "meaning": string,
      "occurrences": string[]
    }
  ]
}`;

    const analysis = await generateStructuredResponse(prompt);
    return [
      ...analysis.major_themes.map(t => t.name),
      ...analysis.motifs.map(m => m.symbol)
    ];
  } catch (error) {
    logger.error(`Failed to extract themes: ${error.message}`);
    return [];
  }
}

async function findThemeContext(character, theme, chapter) {
  try {
    const prompt = `
Analyze how the theme "${theme}" relates to the character "${character}" in this text:
${chapter.text}

Return ONLY valid JSON with this structure:
{
  "arc_type": "positive" | "negative" | "flat" | "circular" | "complex",
  "key_moments": [
    {
      "description": string,
      "impact": string,
      "evidence": string
    }
  ],
  "character_traits": {
    "initial": string[],
    "developed": string[]
  }
}`;

    const development = await generateStructuredResponse(prompt);
    
    // Find theme-related moments
    const relevantMoments = development.key_moments.filter(moment =>
      moment.description.toLowerCase().includes(theme.toLowerCase())
    );

    if (relevantMoments.length > 0) {
      return relevantMoments.map(m => ({
        description: m.description,
        impact: m.impact
      }));
    }
  } catch (error) {
    logger.error(`Failed to find theme context: ${error.message}`);
  }
  return null;
}

async function findEventIndicators(text) {
  try {
    const prompt = `
Identify significant events in this text:
${text}

Return ONLY valid JSON with this structure:
{
  "events": [
    {
      "name": string,
      "description": string,
      "significance": {
        "level": "high" | "medium" | "low",
        "reason": string
      },
      "characters_involved": [
        {
          "name": string,
          "role": string
        }
      ]
    }
  ]
}`;

    const analysis = await generateStructuredResponse(prompt);
    return analysis.events;
  } catch (error) {
    logger.error(`Failed to identify events: ${error.message}`);
    return [];
  }
}

function mergeRelatedEvents(events) {
  const merged = [...events];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const event1 = merged[i];
        const event2 = merged[j];
        
        // Check if events are related
        const similarity = calculateEventSimilarity(event1, event2);
        
        if (similarity > 0.7) {
          // Merge events
          merged[i] = {
            name: event1.name,
            chapters: [...new Set([...event1.chapters, ...event2.chapters])],
            context: `${event1.context}\n${event2.context}`
          };
          merged.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return merged;
}

function calculateEventSimilarity(event1, event2) {
  // Simple name similarity check
  const name1 = event1.name.toLowerCase();
  const name2 = event2.name.toLowerCase();
  
  const words1 = new Set(name1.split(/\W+/));
  const words2 = new Set(name2.split(/\W+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

async function findCharacterRole(character, event, chapter) {
  try {
    const prompt = `
Analyze the role of character "${character}" in the event "${event.name}" in this text:
${chapter.text}

Return ONLY valid JSON with this structure:
{
  "role": {
    "type": "active" | "passive" | "participant" | "observer",
    "confidence": number,
    "evidence": string[]
  }
}`;

    const analysis = await generateStructuredResponse(prompt);
    return {
      type: analysis.role.type,
      confidence: analysis.role.confidence
    };
  } catch (error) {
    logger.error(`Failed to find character role: ${error.message}`);
    return null;
  }
}

async function determineEventImpact(bio, event, chapter) {
  try {
    const prompt = `
Analyze how the event "${event.name}" impacts the character "${bio.name}" in this text:
${chapter.text}

Return ONLY valid JSON with this structure:
{
  "impact": {
    "level": "transformative" | "major" | "moderate" | "minor",
    "description": string,
    "evidence": string[]
  }
}`;

    const analysis = await generateStructuredResponse(prompt);
    
    // Map impact levels to numeric values
    const impacts = {
      'transformative': 1,
      'major': 0.8,
      'moderate': 0.5,
      'minor': 0.2
    };
    
    return impacts[analysis.impact.level.toLowerCase()] || 0.5;
  } catch (error) {
    logger.error(`Failed to determine event impact: ${error.message}`);
    return 0.5; // Default medium impact
  }
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