/**
 * Infer relationship type from interactions
 * @param {Array} interactions - List of interactions between characters
 * @returns {Object} Relationship type analysis
 */
function inferRelationshipType(interactions) {
  // Count interaction types
  const typeCounts = {};
  let totalWeight = 0;
  
  for (const interaction of interactions) {
    const weight = interaction.weight || 1;
    typeCounts[interaction.type] = (typeCounts[interaction.type] || 0) + weight;
    totalWeight += weight;
  }
  
  // Get primary and secondary types
  const sortedTypes = Object.entries(typeCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([type, count]) => ({
      type,
      strength: count / totalWeight
    }));
  
  return {
    primary: sortedTypes[0]?.type || 'unknown',
    secondary: sortedTypes[1]?.type,
    type_distribution: Object.fromEntries(
      sortedTypes.map(({type, strength}) => [type, strength])
    )
  };
}

/**
 * Calculate relationship strength from interactions and co-occurrences
 * @param {Array} interactions - List of interactions between characters
 * @param {Object} coOccurrences - Co-occurrence data
 * @returns {Object} Strength analysis
 */
function calculateRelationshipStrength(interactions, coOccurrences) {
  // Calculate base strength from interaction count
  const baseStrength = Math.min(1, Math.log2(interactions.length + 1) / 4);
  
  // Calculate average sentiment and significance
  let totalSentiment = 0;
  let totalSignificance = 0;
  let totalThemes = new Set();
  let totalQuotes = [];
  
  const significanceScores = {
    'high': 1,
    'medium': 0.6,
    'low': 0.3
  };
  
  for (const interaction of interactions) {
    totalSentiment += Math.abs(interaction.interaction.sentiment || 0);
    totalSignificance += significanceScores[interaction.interaction.significance] || 0.3;
    
    if (interaction.interaction.themes) {
      interaction.interaction.themes.forEach(theme => totalThemes.add(theme));
    }
    if (interaction.interaction.quotes) {
      totalQuotes.push(...interaction.interaction.quotes);
    }
  }
  
  const avgSentiment = interactions.length > 0 ? totalSentiment / interactions.length : 0;
  const avgSignificance = interactions.length > 0 ? totalSignificance / interactions.length : 0;
  
  // Calculate co-occurrence score
  const coOccurrenceScore = coOccurrences ? 
    Math.min(1, coOccurrences.total_scenes / 10) : 0;
  
  // Combine scores
  const score = (baseStrength + avgSentiment + avgSignificance + coOccurrenceScore) / 4;
  
  // Calculate confidence based on interaction count and consistency
  const sentiments = interactions.map(i => i.interaction.sentiment || 0);
  const sentimentVariance = calculateVariance(sentiments);
  const confidence = Math.min(
    1, 
    (0.5 + Math.log2(interactions.length + 1) / 4) * (1 - sentimentVariance)
  );
  
  return {
    score,
    confidence,
    interaction_count: interactions.length,
    co_occurrence_score: coOccurrenceScore,
    components: {
      base_strength: baseStrength,
      avg_sentiment: avgSentiment,
      avg_significance: avgSignificance,
      sentiment_variance: sentimentVariance,
      unique_themes: Array.from(totalThemes),
      key_quotes: totalQuotes.slice(0, 5) // Keep top 5 quotes
    }
  };
}

function calculateVariance(numbers) {
  if (numbers.length === 0) return 0;
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const squareDiffs = numbers.map(x => Math.pow(x - mean, 2));
  const variance = squareDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  return Math.min(1, variance);
}

/**
 * Infer character's role in a social group
 * @param {Object} character - Character data
 * @param {Object} group - Social group data
 * @returns {string} Inferred role
 */
function inferRole(character, group) {
  // Check explicit role mentions in character bio
  if (character.character_arc) {
    const arc = character.character_arc.toLowerCase();
    
    if (arc.includes('leader') || arc.includes('command')) {
      return 'leader';
    }
    if (arc.includes('advisor') || arc.includes('counsel')) {
      return 'advisor';
    }
    if (arc.includes('support') || arc.includes('assist')) {
      return 'supporter';
    }
  }

  // Check interaction patterns
  const interactionCount = group.members.filter(m => 
    m.name !== character.name &&
    character.source_files.some(f => m.source_files.includes(f))
  ).length;

  if (interactionCount > group.members.length * 0.7) {
    return 'central';
  }
  if (interactionCount < group.members.length * 0.3) {
    return 'peripheral';
  }

  return 'member';
}

/**
 * Calculate character's influence in a group
 * @param {Object} character - Character data
 * @param {Object} group - Social group data
 * @returns {number} Influence score (1-10)
 */
function calculateInfluence(character, group) {
  let score = 5; // Default neutral score

  // Factor 1: Interaction frequency
  const interactionScore = calculateInteractionScore(character, group);
  score += interactionScore;

  // Factor 2: Character priority
  if (character.priority) {
    score += Math.min(3, character.priority);
  }

  // Factor 3: Role importance
  const role = inferRole(character, group);
  switch (role) {
    case 'leader':
      score += 2;
      break;
    case 'advisor':
      score += 1;
      break;
    case 'peripheral':
      score -= 1;
      break;
  }

  // Ensure score stays within 1-10 range
  return Math.max(1, Math.min(10, score));
}

/**
 * Calculate confidence in relationship assessment
 * @param {number} interactionCount - Number of direct interactions
 * @param {Object} coOccurrences - Co-occurrence data
 * @returns {number} Confidence score between 0 and 1
 */
function calculateConfidence(interactionCount, coOccurrences) {
  let confidence = 0;
  
  // More interactions = higher confidence
  confidence += Math.min(0.5, interactionCount * 0.1); // Up to 0.5 from interaction count
  
  // Co-occurrence data adds confidence
  if (coOccurrences?.total_scenes) {
    confidence += Math.min(0.3, coOccurrences.total_scenes * 0.05); // Up to 0.3 from co-occurrences
    
    // Variety of contexts increases confidence
    const contextTypes = Object.keys(coOccurrences.context_patterns || {}).length;
    confidence += Math.min(0.2, contextTypes * 0.04); // Up to 0.2 from context variety
  }
  
  return Math.min(1, confidence);
}

/**
 * Calculate interaction score for influence calculation
 * @param {Object} character - Character data
 * @param {Object} group - Social group data
 * @returns {number} Score adjustment
 */
function calculateInteractionScore(character, group) {
  const totalMembers = group.members.length;
  const interactingMembers = group.members.filter(m => 
    m.name !== character.name &&
    character.source_files.some(f => m.source_files.includes(f))
  ).length;

  const interactionRatio = interactingMembers / totalMembers;
  
  if (interactionRatio > 0.8) return 2;
  if (interactionRatio > 0.6) return 1;
  if (interactionRatio < 0.3) return -1;
  if (interactionRatio < 0.1) return -2;
  
  return 0;
}

/**
 * Classify event type based on description and context
 * @param {Object} event - Event data
 * @returns {string} Event type
 */
function classifyEvent(event) {
  const eventTypes = {
    conflict: ['battle', 'fight', 'war', 'conflict', 'duel'],
    social: ['meeting', 'gathering', 'party', 'celebration'],
    dramatic: ['revelation', 'discovery', 'confrontation'],
    tragedy: ['death', 'loss', 'disaster', 'accident'],
    journey: ['departure', 'arrival', 'journey', 'quest'],
    transformation: ['change', 'transformation', 'conversion']
  };

  const description = event.name.toLowerCase();
  
  for (const [type, keywords] of Object.entries(eventTypes)) {
    if (keywords.some(keyword => description.includes(keyword))) {
      return type;
    }
  }

  return 'other';
}

module.exports = {
  inferRelationshipType,
  calculateRelationshipStrength,
  inferRole,
  calculateInfluence,
  classifyEvent
};