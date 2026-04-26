const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// ==================== LOGGING SETUP ====================
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage, data);
  } else {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage);
  }
};

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  log('INFO', `[API] ${req.method} ${req.path}`, { headers: req.headers });
  
  const originalJson = res.json;
  res.json = function(data) {
    log('INFO', `[API RESPONSE] ${req.method} ${req.path} - Status: ${res.statusCode}`);
    return originalJson.call(this, data);
  };
  
  next();
});

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://etfuser:etfpass123@etfcluster.mongodb.net/etf-screener?retryWrites=true&w=majority';

log('INFO', 'Connecting to MongoDB...', { uri: MONGO_URI.substring(0, 50) + '...' });

mongoose.connect(MONGO_URI)
  .then(() => {
    log('INFO', '✅ MongoDB connected successfully');
  })
  .catch((err) => {
    log('ERROR', '❌ MongoDB connection failed', { error: err.message });
    log('WARN', '⚠️  Running in demo mode without persistent storage');
  });

// Routes
const authRoutes = require('./routes/auth');
const priceRoutes = require('./routes/prices');
const marketRoutes = require('./routes/market');
const etfRoutes = require('./routes/etfs');

const historicalPricesRoute = require('./routes/historicalPrices');
const oiSpurtsRoute = require('./routes/oiSpurts');
const etfReturnsRoute = require('./routes/etfReturns');
const etfNewsRoute = require('./routes/etfNews');
const globalMarketsRoute = require('./routes/globalMarkets');

log('INFO', 'Initializing API routes...');
app.use('/api/auth', authRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/etfs', etfRoutes);
app.use('/api/historical-price', historicalPricesRoute);
app.use('/api/oi-spurts', oiSpurtsRoute);
app.use('/api/etf-returns', etfReturnsRoute);
app.use('/api/etf-news', etfNewsRoute);
app.use('/api/global-markets', globalMarketsRoute);

// Health check
app.get('/api/health', (req, res) => {
  log('INFO', '[HEALTH CHECK] System status request');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  log('ERROR', `[ERROR HANDLER] ${err.message}`, { 
    path: req.path, 
    method: req.method,
    stack: err.stack 
  });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  log('INFO', `✅ ETF Screener API running on http://localhost:${PORT}`);
  log('INFO', `📊 Market Dashboard available at http://localhost:3000`);
  log('INFO', '🚀 Server startup complete - Ready to accept requests');
});

