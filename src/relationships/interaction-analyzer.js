const logger = require('../utils/logger');

/**
 * Interaction level definitions with weights
 */
const InteractionLevel = {
  DIRECT_DIALOGUE: {
    weight: 1.0,
    patterns: [
      /(\w+)\s+said to\s+(\w+)/i,
      /(\w+)\s+(told|asked|answered)\s+(\w+)/i,
      /"[^"]+,"\s+(\w+)\s+(said|replied) to\s+(\w+)/i,
      /conversation between\s+(\w+)\s+and\s+(\w+)/i,
      /(\w+)\s+and\s+(\w+)\s+discussed/i
    ]
  },
  DIRECT_ACTION: {
    weight: 0.9,
    patterns: [
      /(\w+)\s+(grabbed|touched|hit|embraced|approached|faced)\s+(\w+)/i,
      /(\w+)\s+and\s+(\w+)\s+(fought|danced|walked|sat)/i,
      /(\w+)\s+(gave|handed|passed)\s+\w+\s+to\s+(\w+)/i,
      /(\w+)\s+(watched|observed|stared at)\s+(\w+)/i
    ]
  },
  SHARED_SCENE: {
    weight: 0.7,
    indicators: [
      "together",
      "both",
      "with each other",
      "in the same",
      "present were",
      "among them",
      "gathered",
      "assembled"
    ]
  },
  INDIRECT_INTERACTION: {
    weight: 0.5,
    patterns: [
      /(\w+)\s+heard about\s+(\w+)/i,
      /(\w+)\s+learned of\s+(\w+)'s/i,
      /(\w+)\s+left\s+\w+\s+for\s+(\w+)/i,
      /(\w+)\s+thought about\s+(\w+)/i
    ]
  },
  MENTIONED_TOGETHER: {
    weight: 0.3,
    // No specific patterns - detected by proximity in text
  },
  SEPARATE_MENTIONS: {
    weight: 0.1,
    // Default when characters appear in same chapter
  }
};

/**
 * Emotional context analysis
 */
const EmotionalContext = {
  positive: {
    words: [
      "smiled", "laughed", "embraced", "helped", "supported",
      "pleased", "happy", "delighted", "grateful", "friendly",
      "warmly", "kindly", "gently", "lovingly", "cheerfully"
    ],
    weight: 1.2
  },
  negative: {
    words: [
      "glared", "argued", "fought", "avoided", "hated",
      "angry", "furious", "hostile", "coldly", "bitterly",
      "harshly", "cruelly", "angrily", "resentfully", "hatefully"
    ],
    weight: 0.8
  },
  neutral: {
    words: [
      "looked", "spoke", "met", "saw", "noticed",
      "said", "replied", "answered", "asked", "responded",
      "quietly", "calmly", "simply", "plainly", "normally"
    ],
    weight: 1.0
  }
};

/**
 * Interaction quality analysis
 */
const InteractionQuality = {
  intensity: {
    high: {
      words: ["violently", "passionately", "desperately", "intensely", "fervently"],
      weight: 1.3
    },
    medium: {
      words: ["firmly", "clearly", "directly", "steadily", "definitely"],
      weight: 1.0
    },
    low: {
      words: ["briefly", "slightly", "casually", "mildly", "faintly"],
      weight: 0.7
    }
  },
  significance: {
    major: {
      words: ["crucial", "important", "significant", "vital", "essential"],
      weight: 1.4
    },
    minor: {
      words: ["trivial", "passing", "brief", "minor", "insignificant"],
      weight: 0.6
    }
  }
};

/**
 * Analyze interactions between two characters in a chapter
 * @param {string} char1 - First character name
 * @param {string} char2 - Second character name
 * @param {Object} chapter - Chapter data
 * @returns {Array} Detailed interactions
 */
async function analyzeChapterInteractions(char1, char2, chapter) {
  const interactions = [];
  
  // Split chapter into scenes
  const scenes = splitIntoScenes(chapter.text);
  
  for (const scene of scenes) {
    // Check if both characters are in the scene
    if (isSceneRelevant(scene, char1, char2)) {
      const sceneInteractions = await analyzeScene(scene, char1, char2);
      interactions.push(...sceneInteractions);
    }
  }

  return interactions;
}

/**
 * Split chapter text into scenes
 * @param {string} text - Chapter text
 * @returns {Array} Scene blocks
 */
function splitIntoScenes(text) {
  // Scene breaks often indicated by:
  // 1. Blank lines
  // 2. Time transitions ("Later", "The next day")
  // 3. Location changes ("In the garden", "At the house")
  
  const sceneBreakPatterns = [
    /\n\s*\n/,  // Blank lines
    /Later|The next|That evening|The following/i,  // Time transitions
    /In the|At the|Inside the|Outside|Back at/i  // Location changes
  ];
  
  let scenes = [text];
  
  for (const pattern of sceneBreakPatterns) {
    scenes = scenes.flatMap(scene => scene.split(pattern));
  }
  
  return scenes.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Check if a scene contains both characters
 * @param {string} scene - Scene text
 * @param {string} char1 - First character
 * @param {string} char2 - Second character
 * @returns {boolean} Whether scene is relevant
 */
function isSceneRelevant(scene, char1, char2) {
  const text = scene.toLowerCase();
  return text.includes(char1.toLowerCase()) && 
         text.includes(char2.toLowerCase());
}

/**
 * Analyze interactions in a scene
 * @param {string} scene - Scene text
 * @param {string} char1 - First character
 * @param {string} char2 - Second character
 * @returns {Array} Interactions found
 */
async function analyzeScene(scene, char1, char2) {
  const interactions = [];
  
  // Split into sentences for detailed analysis
  const sentences = scene.split(/[.!?]+/).map(s => s.trim());
  
  for (const sentence of sentences) {
    // Check each interaction type
    const interaction = findInteraction(sentence, char1, char2);
    if (interaction) {
      // Enhance with context
      interaction.emotion = analyzeEmotionalContext(sentence);
      interaction.intensity = analyzeInteractionIntensity(sentence);
      interaction.significance = analyzeInteractionSignificance(sentence);
      interaction.context = extractInteractionContext(sentence);
      
      interactions.push(interaction);
    }
  }

  return interactions;
}

/**
 * Find interaction type in a sentence
 * @param {string} sentence - Sentence to analyze
 * @param {string} char1 - First character
 * @param {string} char2 - Second character
 * @returns {Object|null} Interaction details if found
 */
function findInteraction(sentence, char1, char2) {
  // Check for direct dialogue
  for (const pattern of InteractionLevel.DIRECT_DIALOGUE.patterns) {
    const match = sentence.match(pattern);
    if (match && isCharacterPair(match, char1, char2)) {
      return {
        type: 'DIRECT_DIALOGUE',
        text: sentence,
        weight: InteractionLevel.DIRECT_DIALOGUE.weight
      };
    }
  }

  // Check for direct action
  for (const pattern of InteractionLevel.DIRECT_ACTION.patterns) {
    const match = sentence.match(pattern);
    if (match && isCharacterPair(match, char1, char2)) {
      return {
        type: 'DIRECT_ACTION',
        text: sentence,
        weight: InteractionLevel.DIRECT_ACTION.weight
      };
    }
  }

  // Check for shared scene indicators
  if (InteractionLevel.SHARED_SCENE.indicators.some(i => 
    sentence.toLowerCase().includes(i)
  )) {
    return {
      type: 'SHARED_SCENE',
      text: sentence,
      weight: InteractionLevel.SHARED_SCENE.weight
    };
  }

  // Check for indirect interaction
  for (const pattern of InteractionLevel.INDIRECT_INTERACTION.patterns) {
    const match = sentence.match(pattern);
    if (match && isCharacterPair(match, char1, char2)) {
      return {
        type: 'INDIRECT_INTERACTION',
        text: sentence,
        weight: InteractionLevel.INDIRECT_INTERACTION.weight
      };
    }
  }

  // If both are mentioned but no specific interaction
  if (sentence.toLowerCase().includes(char1.toLowerCase()) && 
      sentence.toLowerCase().includes(char2.toLowerCase())) {
    return {
      type: 'MENTIONED_TOGETHER',
      text: sentence,
      weight: InteractionLevel.MENTIONED_TOGETHER.weight
    };
  }

  return null;
}

/**
 * Check if matched groups contain character pair
 * @param {Array} match - Regex match result
 * @param {string} char1 - First character
 * @param {string} char2 - Second character
 * @returns {boolean} Whether match contains both characters
 */
function isCharacterPair(match, char1, char2) {
  const matchText = match.slice(1).join(' ').toLowerCase();
  return (matchText.includes(char1.toLowerCase()) && 
          matchText.includes(char2.toLowerCase()));
}

/**
 * Analyze emotional context of interaction
 * @param {string} text - Interaction text
 * @returns {Object} Emotional analysis
 */
function analyzeEmotionalContext(text) {
  text = text.toLowerCase();
  
  // Check each emotion type
  for (const [type, data] of Object.entries(EmotionalContext)) {
    if (data.words.some(word => text.includes(word))) {
      return {
        type,
        weight: data.weight,
        indicators: data.words.filter(word => text.includes(word))
      };
    }
  }
  
  return {
    type: 'neutral',
    weight: 1.0,
    indicators: []
  };
}

/**
 * Analyze interaction intensity
 * @param {string} text - Interaction text
 * @returns {Object} Intensity analysis
 */
function analyzeInteractionIntensity(text) {
  text = text.toLowerCase();
  
  for (const [level, data] of Object.entries(InteractionQuality.intensity)) {
    if (data.words.some(word => text.includes(word))) {
      return {
        level,
        weight: data.weight,
        indicators: data.words.filter(word => text.includes(word))
      };
    }
  }
  
  return {
    level: 'medium',
    weight: 1.0,
    indicators: []
  };
}

/**
 * Analyze interaction significance
 * @param {string} text - Interaction text
 * @returns {Object} Significance analysis
 */
function analyzeInteractionSignificance(text) {
  text = text.toLowerCase();
  
  for (const [level, data] of Object.entries(InteractionQuality.significance)) {
    if (data.words.some(word => text.includes(word))) {
      return {
        level,
        weight: data.weight,
        indicators: data.words.filter(word => text.includes(word))
      };
    }
  }
  
  return {
    level: 'normal',
    weight: 1.0,
    indicators: []
  };
}

/**
 * Extract context from interaction
 * @param {string} text - Interaction text
 * @returns {Object} Context details
 */
function extractInteractionContext(text) {
  return {
    setting: extractSetting(text),
    otherPresent: findOtherCharactersPresent(text),
    privacy: determinePrivacyLevel(text),
    time: extractTimeContext(text)
  };
}

/**
 * Extract setting from text
 * @param {string} text - Text to analyze
 * @returns {string|null} Setting if found
 */
function extractSetting(text) {
  const settingPatterns = [
    /in the (\w+)/i,
    /at the (\w+)/i,
    /near the (\w+)/i,
    /inside the (\w+)/i
  ];
  
  for (const pattern of settingPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Find other characters present
 * @param {string} text - Text to analyze
 * @returns {Array} Other character names found
 */
function findOtherCharactersPresent(text) {
  // This would need a comprehensive character list
  // For now, return empty array
  return [];
}

/**
 * Determine privacy level of interaction
 * @param {string} text - Text to analyze
 * @returns {string} Privacy level
 */
function determinePrivacyLevel(text) {
  text = text.toLowerCase();
  
  const privateIndicators = [
    'alone', 'private', 'secretly', 'whispered',
    'quietly', 'intimate', 'personal'
  ];
  
  const publicIndicators = [
    'crowd', 'everyone', 'public', 'gathering',
    'assembly', 'audience', 'openly'
  ];
  
  if (privateIndicators.some(i => text.includes(i))) {
    return 'private';
  }
  if (publicIndicators.some(i => text.includes(i))) {
    return 'public';
  }
  
  return 'unknown';
}

/**
 * Extract time context
 * @param {string} text - Text to analyze
 * @returns {string|null} Time context if found
 */
function extractTimeContext(text) {
  const timePatterns = [
    /in the (morning|afternoon|evening|night)/i,
    /at (dawn|dusk|noon|midnight)/i,
    /(early|late) in the day/i,
    /the next (day|morning|week)/i
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

module.exports = {
  analyzeChapterInteractions,
  InteractionLevel,
  EmotionalContext,
  InteractionQuality
};