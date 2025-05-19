const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const { connectToMongo } = require('./utils/mongoClient');
const relationshipsRouter = require('./routes/relationships');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/relationships', relationshipsRouter);

// Connect to MongoDB
connectToMongo().then(() => {
  logger.info('Connected to MongoDB');
}).catch(err => {
  logger.error('Failed to connect to MongoDB:', err);
});

// Error handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
});

module.exports = app;