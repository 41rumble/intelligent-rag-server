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
    
    // Check if metadata already exists
    const existing = await collection.findOne({ type: 'book_metadata' });
    if (existing) {
      await collection.updateOne(
        { type: 'book_metadata' },
        { $set: metadata }
      );
      console.log('\n✅ Updated existing book metadata');
    } else {
      await collection.insertOne(metadata);
      console.log('\n✅ Stored new book metadata');
    }
  } catch (error) {
    console.error('Failed to store metadata:', error);
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