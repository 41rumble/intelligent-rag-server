const logger = require('../utils/logger');
const { analyzeChapterInteractions } = require('./interaction-analyzer');

/**
 * Build comprehensive relationship data between characters
 * @param {string} char1 - First character name
 * @param {string} char2 - Second character name
 * @param {Array} chapters - Chapter data
 * @returns {Object} Detailed relationship analysis
 */
async function buildDetailedRelationship(char1, char2, chapters) {
  logger.info(`Analyzing relationship between ${char1} and ${char2}`);
  
  const allInteractions = [];
  let totalChapters = 0;
  
  // Analyze each chapter for interactions
  for (const chapter of chapters) {
    const interactions = await analyzeChapterInteractions(char1, char2, chapter);
    
    if (interactions.length > 0) {
      totalChapters++;
      allInteractions.push({
        chapter: chapter.chapter_id,
        interactions
      });
    }
  }

  // Calculate relationship metrics
  const metrics = calculateRelationshipMetrics(allInteractions);
  
  // Analyze relationship progression
  const progression = analyzeRelationshipProgression(allInteractions);
  
  // Identify key moments
  const keyMoments = findKeyMoments(allInteractions);

  return {
    type: "character_relationship",
    source_character: char1,
    target_character: char2,
    relationship_type: inferRelationshipType(metrics),
    interaction_summary: {
      total_interactions: allInteractions.reduce(
        (sum, ch) => sum + ch.interactions.length, 0
      ),
      chapters_with_interactions: totalChapters,
      by_type: metrics.typeBreakdown,
      emotional_trend: metrics.emotionalTrend,
      typical_intensity: metrics.typicalIntensity,
      privacy_level: metrics.typicalPrivacy
    },
    strength: {
      score: metrics.strength,
      confidence: metrics.confidence
    },
    progression: {
      pattern: progression.pattern,
      significant_changes: progression.changes,
      current_state: progression.currentState
    },
    key_moments: keyMoments,
    context: {
      typical_settings: metrics.commonSettings,
      common_witnesses: metrics.commonWitnesses,
      typical_circumstances: metrics.typicalCircumstances
    }
  };
}

/**
 * Calculate comprehensive relationship metrics
 * @param {Array} chapterInteractions - Interactions by chapter
 * @returns {Object} Relationship metrics
 */
function calculateRelationshipMetrics(chapterInteractions) {
  // Initialize counters
  const typeCount = {};
  const emotions = [];
  const intensities = [];
  const settings = new Map();
  const witnesses = new Map();
  const privacyLevels = [];
  
  let totalWeight = 0;
  let weightedSum = 0;
  
  // Process all interactions
  for (const chapter of chapterInteractions) {
    for (const interaction of chapter.interactions) {
      // Count interaction types
      typeCount[interaction.type] = (typeCount[interaction.type] || 0) + 1;
      
      // Track emotional context
      emotions.push(interaction.emotion);
      
      // Track intensity
      intensities.push(interaction.intensity);
      
      // Track settings
      if (interaction.context.setting) {
        settings.set(
          interaction.context.setting,
          (settings.get(interaction.context.setting) || 0) + 1
        );
      }
      
      // Track witnesses
      for (const witness of interaction.context.otherPresent || []) {
        witnesses.set(
          witness,
          (witnesses.get(witness) || 0) + 1
        );
      }
      
      // Track privacy
      privacyLevels.push(interaction.context.privacy);
      
      // Calculate weighted strength
      const weight = interaction.weight *
                    interaction.emotion.weight *
                    interaction.intensity.weight *
                    interaction.significance.weight;
      
      weightedSum += weight;
      totalWeight += 1;
    }
  }

  // Calculate metrics
  return {
    typeBreakdown: typeCount,
    emotionalTrend: calculateEmotionalTrend(emotions),
    typicalIntensity: calculateTypicalIntensity(intensities),
    commonSettings: Array.from(settings.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([setting]) => setting),
    commonWitnesses: Array.from(witnesses.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([witness]) => witness),
    typicalPrivacy: calculateTypicalPrivacy(privacyLevels),
    strength: weightedSum / totalWeight,
    confidence: calculateConfidence(totalWeight)
  };
}

/**
 * Calculate emotional trend from interaction emotions
 * @param {Array} emotions - Emotion records
 * @returns {Object} Emotional trend analysis
 */
function calculateEmotionalTrend(emotions) {
  const counts = {
    positive: 0,
    negative: 0,
    neutral: 0
  };
  
  emotions.forEach(emotion => {
    counts[emotion.type]++;
  });
  
  const total = emotions.length;
  const trend = {
    dominant: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0],
    distribution: {
      positive: counts.positive / total,
      negative: counts.negative / total,
      neutral: counts.neutral / total
    }
  };
  
  // Analyze progression
  const progression = analyzeEmotionalProgression(emotions);
  
  return {
    ...trend,
    progression
  };
}

/**
 * Calculate typical interaction intensity
 * @param {Array} intensities - Intensity records
 * @returns {Object} Intensity analysis
 */
function calculateTypicalIntensity(intensities) {
  const counts = {
    high: 0,
    medium: 0,
    low: 0
  };
  
  intensities.forEach(intensity => {
    counts[intensity.level]++;
  });
  
  const total = intensities.length;
  
  return {
    typical: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0],
    distribution: {
      high: counts.high / total,
      medium: counts.medium / total,
      low: counts.low / total
    }
  };
}

/**
 * Calculate typical privacy level
 * @param {Array} privacyLevels - Privacy level records
 * @returns {string} Typical privacy level
 */
function calculateTypicalPrivacy(privacyLevels) {
  const counts = {
    private: 0,
    public: 0,
    unknown: 0
  };
  
  privacyLevels.forEach(level => {
    counts[level]++;
  });
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Calculate confidence score based on interaction count
 * @param {number} interactionCount - Number of interactions
 * @returns {number} Confidence score (0-1)
 */
function calculateConfidence(interactionCount) {
  // More interactions = higher confidence
  // Using logarithmic scale with diminishing returns
  return Math.min(1, Math.log10(interactionCount + 1) / 2);
}

/**
 * Analyze relationship progression over time
 * @param {Array} chapterInteractions - Interactions by chapter
 * @returns {Object} Progression analysis
 */
function analyzeRelationshipProgression(chapterInteractions) {
  // Calculate per-chapter metrics
  const chapterMetrics = chapterInteractions.map(chapter => {
    const metrics = calculateRelationshipMetrics([chapter]);
    return {
      chapter: chapter.chapter_id,
      strength: metrics.strength,
      dominant_emotion: metrics.emotionalTrend.dominant,
      intensity: metrics.typicalIntensity.typical
    };
  });
  
  // Analyze pattern
  const pattern = determineProgressionPattern(chapterMetrics);
  
  // Find significant changes
  const changes = findSignificantChanges(chapterMetrics);
  
  // Determine current state
  const currentState = determineCurrentState(
    chapterMetrics.slice(-3)  // Look at last 3 chapters
  );
  
  return {
    pattern,
    changes,
    currentState
  };
}

/**
 * Determine relationship progression pattern
 * @param {Array} metrics - Chapter metrics
 * @returns {string} Pattern description
 */
function determineProgressionPattern(metrics) {
  const strengths = metrics.map(m => m.strength);
  
  // Calculate trend
  const trend = calculateTrend(strengths);
  
  if (Math.abs(trend) < 0.1) {
    return 'stable';
  }
  if (trend > 0) {
    return trend > 0.3 ? 'strongly_improving' : 'gradually_improving';
  }
  return trend < -0.3 ? 'strongly_deteriorating' : 'gradually_deteriorating';
}

/**
 * Find significant changes in relationship
 * @param {Array} metrics - Chapter metrics
 * @returns {Array} Significant changes
 */
function findSignificantChanges(metrics) {
  const changes = [];
  const THRESHOLD = 0.3;  // Significant change threshold
  
  for (let i = 1; i < metrics.length; i++) {
    const change = metrics[i].strength - metrics[i-1].strength;
    
    if (Math.abs(change) >= THRESHOLD) {
      changes.push({
        from_chapter: metrics[i-1].chapter,
        to_chapter: metrics[i].chapter,
        type: change > 0 ? 'improvement' : 'deterioration',
        magnitude: Math.abs(change)
      });
    }
  }
  
  return changes;
}

/**
 * Determine current state of relationship
 * @param {Array} recentMetrics - Recent chapter metrics
 * @returns {Object} Current state analysis
 */
function determineCurrentState(recentMetrics) {
  if (recentMetrics.length === 0) {
    return {
      state: 'unknown',
      confidence: 0
    };
  }
  
  const averageStrength = recentMetrics.reduce(
    (sum, m) => sum + m.strength, 0
  ) / recentMetrics.length;
  
  const dominantEmotion = findDominantEmotion(
    recentMetrics.map(m => m.dominant_emotion)
  );
  
  return {
    state: determineState(averageStrength, dominantEmotion),
    strength: averageStrength,
    dominant_emotion: dominantEmotion,
    confidence: calculateConfidence(recentMetrics.length)
  };
}

/**
 * Find key moments in the relationship
 * @param {Array} chapterInteractions - Interactions by chapter
 * @returns {Array} Key moments
 */
function findKeyMoments(chapterInteractions) {
  const keyMoments = [];
  
  for (const chapter of chapterInteractions) {
    for (const interaction of chapter.interactions) {
      // Check if this is a key moment
      if (isKeyMoment(interaction)) {
        keyMoments.push({
          chapter: chapter.chapter_id,
          type: interaction.type,
          description: interaction.text,
          significance: interaction.significance.level,
          context: interaction.context
        });
      }
    }
  }
  
  // Sort by significance and return top moments
  return keyMoments
    .sort((a, b) => 
      significanceWeight(b.significance) - significanceWeight(a.significance)
    )
    .slice(0, 5);
}

/**
 * Check if an interaction represents a key moment
 * @param {Object} interaction - Interaction data
 * @returns {boolean} Whether this is a key moment
 */
function isKeyMoment(interaction) {
  return (
    interaction.significance.level === 'major' ||
    (interaction.type === 'DIRECT_DIALOGUE' && 
     interaction.intensity.level === 'high') ||
    (interaction.type === 'DIRECT_ACTION' && 
     interaction.intensity.level === 'high')
  );
}

/**
 * Get weight for significance level
 * @param {string} significance - Significance level
 * @returns {number} Weight
 */
function significanceWeight(significance) {
  switch (significance) {
    case 'major': return 3;
    case 'normal': return 2;
    case 'minor': return 1;
    default: return 0;
  }
}

/**
 * Calculate trend in numeric series
 * @param {Array} values - Numeric values
 * @returns {number} Trend coefficient
 */
function calculateTrend(values) {
  if (values.length < 2) return 0;
  
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

/**
 * Find dominant emotion in a set
 * @param {Array} emotions - Emotion records
 * @returns {string} Dominant emotion
 */
function findDominantEmotion(emotions) {
  const counts = {};
  let maxCount = 0;
  let dominant = 'neutral';
  
  emotions.forEach(emotion => {
    counts[emotion] = (counts[emotion] || 0) + 1;
    if (counts[emotion] > maxCount) {
      maxCount = counts[emotion];
      dominant = emotion;
    }
  });
  
  return dominant;
}

/**
 * Determine relationship state based on metrics
 * @param {number} strength - Relationship strength
 * @param {string} emotion - Dominant emotion
 * @returns {string} Relationship state
 */
function determineState(strength, emotion) {
  if (strength > 7) {
    return emotion === 'positive' ? 'strong_positive' : 'intense_negative';
  }
  if (strength > 5) {
    return emotion === 'positive' ? 'positive' : 'negative';
  }
  if (strength > 3) {
    return emotion === 'neutral' ? 'neutral' : 'weak';
  }
  return 'distant';
}

module.exports = {
  buildDetailedRelationship
};