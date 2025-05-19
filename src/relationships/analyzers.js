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
  let totalScore = 0;
  let totalWeight = 0;
  
  // Score from direct interactions
  for (const interaction of interactions) {
    const weight = interaction.weight || 1;
    const emotionMod = interaction.emotion?.weight || 1;
    const intensityMod = interaction.intensity?.weight || 1;
    const significanceMod = interaction.significance?.weight || 1;
    
    // Combine modifiers
    const finalWeight = weight * emotionMod * intensityMod * significanceMod;
    
    totalScore += finalWeight;
    totalWeight += 1;
  }
  
  // Add co-occurrence influence
  if (coOccurrences) {
    totalScore += coOccurrences.proximity_score * 0.5; // Weight co-occurrences less than direct interactions
    totalWeight += 0.5;
  }
  
  const averageScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  
  return {
    score: averageScore,
    confidence: calculateConfidence(interactions.length, coOccurrences),
    interaction_count: interactions.length,
    co_occurrence_score: coOccurrences?.proximity_score || 0
  };
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