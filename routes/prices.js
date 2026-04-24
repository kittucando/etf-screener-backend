const express = require('express');
const router = express.Router();
const priceService = require('../services/priceService');

const ETF_SYMBOLS = [
  'NIFTYBEES', 'JUNIORBEES', 'BANKBEES', 'GOLDBEES', 'LIQUIDBEES',
  'SETFNIFBK', 'SETFNIF50', 'ICICINIFTY', 'ICICIBANKP', 'ICICIGOLD',
  'HDFCNIFETF', 'HDFCSENETF', 'KOTAKNIFTY', 'KOTAKBKETF', 'KOTAKGOLD',
  'MOSNIFTY', 'MOSMIDCAP', 'MOSMOMENTUM', 'MAFANG', 'MOMENTUM',
  'HEALTHY', 'CONSUME', 'INFRABEES', 'ITBEES', 'PSUBNKBEES',
  'CPSEETF', 'PHARMABEES', 'AUTOBEES'
];

// Get single price
router.get('/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const priceData = await priceService.getETFPrice(symbol);
    if (priceData) {
      res.json(priceData);
    } else {
      res.status(404).json({ error: 'Price not available', symbol });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all ETF prices
router.get('/', async (req, res) => {
  try {
    const prices = await priceService.getMultiplePrices(ETF_SYMBOLS);
    const results = {
      total: ETF_SYMBOLS.length,
      loaded: prices.filter(p => p !== null).length,
      data: prices.filter(p => p !== null),
      failed: prices.filter(p => p === null).length,
      timestamp: new Date().toISOString()
    };
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
