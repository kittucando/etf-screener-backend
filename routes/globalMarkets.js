const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 120 }); // 2-min cache

const SYMBOLS = [
  { symbol: '^GSPC',    label: 'S&P 500',    flag: '🇺🇸', type: 'index' },
  { symbol: '^IXIC',    label: 'Nasdaq',      flag: '🇺🇸', type: 'index' },
  { symbol: '^DJI',     label: 'Dow Jones',   flag: '🇺🇸', type: 'index' },
  { symbol: '^N225',    label: 'Nikkei 225',  flag: '🇯🇵', type: 'index' },
  { symbol: '^HSI',     label: 'Hang Seng',   flag: '🇭🇰', type: 'index' },
  { symbol: '^FTSE',    label: 'FTSE 100',    flag: '🇬🇧', type: 'index' },
  { symbol: 'GC=F',     label: 'Gold',        flag: '🥇',  type: 'commodity' },
  { symbol: 'CL=F',     label: 'Crude (WTI)', flag: '🛢️',  type: 'commodity' },
  { symbol: 'SI=F',     label: 'Silver',      flag: '⚪',  type: 'commodity' },
  { symbol: 'USDINR=X', label: 'USD/INR',     flag: '💱',  type: 'forex'    },
  { symbol: 'EURINR=X', label: 'EUR/INR',     flag: '🇪🇺', type: 'forex'    },
  { symbol: 'BTC-USD',  label: 'Bitcoin',     flag: '₿',   type: 'crypto'   },
];

router.get('/', async (req, res) => {
  const cacheKey = 'global_markets_v1';
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const syms = SYMBOLS.map(s => s.symbol).join(',');
    const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}`;
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 8000,
    });

    const results = resp.data?.quoteResponse?.result || [];
    const data = SYMBOLS.map(s => {
      const q = results.find(r => r.symbol === s.symbol);
      return {
        ...s,
        price:         q?.regularMarketPrice          ?? null,
        change:        q?.regularMarketChange          ?? null,
        changePercent: q?.regularMarketChangePercent   ?? null,
        marketState:   q?.marketState                  ?? 'CLOSED',
      };
    }).filter(s => s.price != null);

    const result = { data, timestamp: new Date().toISOString() };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.warn('[GLOBAL MARKETS] fetch failed:', err.message);
    res.json({ data: [], error: err.message, timestamp: new Date().toISOString() });
  }
});

module.exports = router;
