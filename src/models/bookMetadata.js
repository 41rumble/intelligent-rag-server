const mongoose = require('mongoose');

/**
 * Schema for book metadata
 */
const bookMetadataSchema = new mongoose.Schema({
  project: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  author: {
    type: String,
    required: true
  },
  publication_year: {
    type: Number
  },
  publisher: String,
  language: {
    type: String,
    default: 'en'
  },
  genre: [String],
  description: String,
  time_period: {
    start: String,
    end: String
  },
  locations: [{
    name: String,
    significance: String
  }],
  themes: [{
    theme: String,
    description: String
  }],
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Update the updated_at field on save
bookMetadataSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('BookMetadata', bookMetadataSchema);