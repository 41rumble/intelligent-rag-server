/**
 * Infer relationship type from description
 * @param {string} description - Relationship description
 * @returns {string} Relationship type
 */
function inferRelationshipType(description) {
  const familyTerms = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'uncle', 'aunt', 'cousin'];
  const friendTerms = ['friend', 'ally', 'companion', 'confidant'];
  const antagonistTerms = ['enemy', 'rival', 'opponent', 'adversary'];
  const professionalTerms = ['mentor', 'student', 'teacher', 'colleague', 'servant', 'master'];

  description = description.toLowerCase();

  if (familyTerms.some(term => description.includes(term))) {
    return 'family';
  }
  if (friendTerms.some(term => description.includes(term))) {
    return 'friend';
  }
  if (antagonistTerms.some(term => description.includes(term))) {
    return 'antagonist';
  }
  if (professionalTerms.some(term => description.includes(term))) {
    return 'professional';
  }

  return 'other';
}

/**
 * Calculate relationship strength from description and interactions
 * @param {string} description - Relationship description
 * @returns {number} Strength score (1-10)
 */
function calculateRelationshipStrength(description) {
  const strongIndicators = [
    'close', 'devoted', 'loyal', 'trusted', 'beloved',
    'intimate', 'dedicated', 'faithful', 'inseparable'
  ];
  
  const weakIndicators = [
    'distant', 'estranged', 'former', 'occasional',
    'casual', 'passing', 'brief', 'temporary'
  ];

  description = description.toLowerCase();
  let score = 5; // Default neutral score

  // Adjust for strong indicators
  strongIndicators.forEach(indicator => {
    if (description.includes(indicator)) score += 1;
  });

  // Adjust for weak indicators
  weakIndicators.forEach(indicator => {
    if (description.includes(indicator)) score -= 1;
  });

  // Ensure score stays within 1-10 range
  return Math.max(1, Math.min(10, score));
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