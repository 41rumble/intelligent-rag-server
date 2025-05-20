const readline = require('readline');
const mongoClient = require('../src/utils/mongoClient');
const logger = require('../src/utils/logger');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function promptForMetadata() {
  console.log('\n📚 Book Metadata Setup\n');
  
  const metadata = {
    type: 'book_metadata',
    title: await question('Book Title: '),
    author: await question('Author: '),
    publication_year: parseInt(await question('Publication Year (YYYY): '), 10),
    time_period: {
      start: await question('Time Period Start (e.g., "September 2, 1666"): '),
      end: await question('Time Period End: ')
    }
  };

  // Optional fields
  const publisher = await question('Publisher (optional - press Enter to skip): ');
  if (publisher) metadata.publisher = publisher;

  const description = await question('Brief Description (optional - press Enter to skip): ');
  if (description) metadata.description = description;

  // Handle genres
  const genres = await question('Genres (comma-separated, optional - press Enter to skip): ');
  if (genres.trim()) {
    metadata.genre = genres.split(',').map(g => g.trim());
  }

  // Add timestamps
  metadata.created_at = new Date();
  metadata.updated_at = new Date();

  return metadata;
}

async function storeMetadata(projectId, metadata) {
  try {
    const collection = await mongoClient.getProjectCollection(projectId);
    
    // Prepare document that matches schema requirements
    const document = {
      type: 'preface',
      project: projectId,
      // Required fields
      text: `${metadata.title} by ${metadata.author}\n\nPublication Year: ${metadata.publication_year}\n\nTime Period: ${metadata.time_period.start} to ${metadata.time_period.end}\n\n${metadata.description || ''}`,
      title: metadata.title,
      name: metadata.title,
      
      // Timeline data
      timeline_data: {
        date: metadata.time_period.start,
        time_period: `${metadata.time_period.start} to ${metadata.time_period.end}`
      },
      
      // Add locations with required fields
      locations: [{
        location: "Book Setting",
        description: `Time period from ${metadata.time_period.start} to ${metadata.time_period.end}`,
        significance: "Primary setting of the work"
      }],
      
      // Add basic event structure with required fields
      events: [{
        event: "Book Publication",
        significance: "Publication of the work",
        event_type: "publication",
        impact_level: 5,
        affected_characters: [{
          character: "Author",
          impact: "Created the work"
        }]
      }],
      
      // Add source files
      source_files: [],
      
      // Add technical metadata
      last_updated: new Date(),
      version: '1.0',
      
      // Book-specific metadata
      author: metadata.author,
      publication_year: metadata.publication_year,
      publisher: metadata.publisher || '',
      description: metadata.description || '',
      genre: metadata.genre || []
    };

    // Check if metadata already exists
    const existing = await collection.findOne({ type: 'preface' });
    if (existing) {
      await collection.updateOne(
        { type: 'preface' },
        { $set: document }
      );
      console.log('\n✅ Updated existing book metadata');
    } else {
      await collection.insertOne(document);
      console.log('\n✅ Stored new book metadata');
    }
  } catch (error) {
    console.error('Failed to store metadata:', error);
    if (error.errInfo?.details?.schemaRulesNotSatisfied) {
      console.error('\nSchema validation details:');
      console.error(JSON.stringify(error.errInfo.details.schemaRulesNotSatisfied, null, 2));
    }
    throw error;
  }
}

async function main() {
  try {
    // Get project ID
    const projectId = process.argv[2];
    if (!projectId) {
      console.error('Please provide a project ID');
      process.exit(1);
    }

    // Get metadata from user
    const metadata = await promptForMetadata();
    
    // Add project ID
    metadata.project = projectId;

    // Store in MongoDB
    await storeMetadata(projectId, metadata);

    console.log('\nMetadata stored successfully! 🎉\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    rl.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}