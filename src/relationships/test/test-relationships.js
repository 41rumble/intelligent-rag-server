const { sampleBios, sampleChapters } = require('./sample-data');
const { buildCharacterRelationships } = require('../builders');

async function testRelationshipAnalysis() {
  console.log('Testing relationship analysis...\n');

  try {
    // Build all relationships
    const relationships = await buildCharacterRelationships(sampleBios, sampleChapters);

    // Print detailed analysis for each relationship
    for (const rel of relationships) {
      console.log(`\n=== ${rel.source_character} & ${rel.target_character} ===`);
      
      // Print explicit descriptions if they exist
      if (rel.explicit_description) {
        console.log('\nExplicit description:', rel.explicit_description);
      }
      if (rel.reverse_description) {
        console.log('Reverse description:', rel.reverse_description);
      }

      // Print interaction summary
      console.log('\nInteraction Summary:');
      console.log('- Total interactions:', rel.interaction_summary.total_interactions);
      console.log('- Chapters with interactions:', rel.interaction_summary.chapters_with_interactions);
      console.log('- By type:', JSON.stringify(rel.interaction_summary.by_type, null, 2));
      console.log('- Emotional trend:', rel.interaction_summary.emotional_trend);
      console.log('- Typical intensity:', rel.interaction_summary.typical_intensity);
      console.log('- Privacy level:', rel.interaction_summary.privacy_level);

      // Print relationship strength
      console.log('\nRelationship Strength:');
      console.log('- Score:', rel.strength.score.toFixed(2));
      console.log('- Confidence:', rel.strength.confidence.toFixed(2));

      // Print progression
      console.log('\nProgression:');
      console.log('- Pattern:', rel.progression.pattern);
      console.log('- Current state:', rel.progression.current_state);
      
      if (rel.progression.significant_changes.length > 0) {
        console.log('\nSignificant Changes:');
        for (const change of rel.progression.significant_changes) {
          console.log(`- ${change.type} from ${change.from_chapter} to ${change.to_chapter} (magnitude: ${change.magnitude.toFixed(2)})`);
        }
      }

      // Print key moments
      if (rel.key_moments.length > 0) {
        console.log('\nKey Moments:');
        for (const moment of rel.key_moments) {
          console.log(`- Chapter ${moment.chapter}: ${moment.description} (${moment.significance})`);
        }
      }

      // Print context
      console.log('\nContext:');
      console.log('- Typical settings:', rel.context.typical_settings);
      if (rel.context.common_witnesses.length > 0) {
        console.log('- Common witnesses:', rel.context.common_witnesses);
      }

      console.log('\n' + '='.repeat(50));
    }

  } catch (error) {
    console.error('Error during relationship analysis:', error);
  }
}

// Run the test
testRelationshipAnalysis();