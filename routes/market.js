const express = require('express');
const router = express.Router();
const marketService = require('../services/marketService');
const fiidiiService = require('../services/fiidiiService');

// ==================== LOGGING ====================
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [MARKET ROUTES] [${level}] ${message}`;
  
  if (data) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage, data);
  } else {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage);
  }
};

router.get('/indices', async (req, res) => {
  try {
    log('INFO', '📊 Fetching market indices and FII/DII data...');
    const indices = await marketService.getMarketIndices();
    const fiidii = await fiidiiService.getFIIDIIData();
    
    res.json({
      ...indices,
      fiidii
    });
  } catch (error) {
    log('ERROR', '❌ Failed to fetch market indices', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/mood', async (req, res) => {
  try {
    log('INFO', '📈 Fetching market mood...');
    const indices = await marketService.getMarketIndices();
    res.json(indices.mood);
  } catch (error) {
    log('ERROR', '❌ Failed to fetch market mood', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/fiidii', async (req, res) => {
  try {
    log('INFO', '💰 Fetching FII/DII data...');
    const fiidii = await fiidiiService.getFIIDIIData();
    const trend = fiidiiService.analyzeFIIDIITrend(fiidii.fiiData, fiidii.diiData);
    
    res.json({
      ...fiidii,
      trend
    });
  } catch (error) {
    log('ERROR', '❌ Failed to fetch FII/DII data', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
