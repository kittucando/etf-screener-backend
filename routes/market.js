const express = require('express');
const router = express.Router();
const marketService = require('../services/marketService');
const fiidiiService = require('../services/fiidiiService');
const axios = require('axios');
const NodeCache = require('node-cache');

const routeCache = new NodeCache({ stdTTL: 120 });
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console[level === 'ERROR' ? 'error' : 'log'](`[${timestamp}] [MARKET ROUTES] [${level}] ${message}`, data || '');
};

const GLOBAL_SYMBOLS = [
  { symbol: '^GSPC',    label: 'S&P 500',    flag: '🇺🇸', type: 'index' },
  { symbol: '^IXIC',    label: 'Nasdaq',      flag: '🇺🇸', type: 'index' },
  { symbol: 'GC=F',     label: 'Gold',        flag: '🥇',  type: 'commodity' },
  { symbol: 'CL=F',     label: 'Crude Oil',   flag: '🛢️',  type: 'commodity' },
  { symbol: 'USDINR=X', label: 'USD/INR',     flag: '💱',  type: 'forex'    },
  { symbol: 'BTC-USD',  label: 'Bitcoin',     flag: '₿',   type: 'crypto'   },
];

// Fallback data if Yahoo is dead
const FALLBACK_DATA = [
  { label: 'S&P 500',   price: 5240, changePercent: 1.15, flag: '🇺🇸' },
  { label: 'Nasdaq',    price: 18350, changePercent: 1.42, flag: '🇺🇸' },
  { label: 'Gold',      price: 2350, changePercent: 0.45, flag: '🥇' },
  { label: 'Crude Oil', price: 82.5, changePercent: -0.8, flag: '🛢️' },
  { label: 'USD/INR',   price: 83.42, changePercent: 0.05, flag: '💱' },
];

router.get(['/global', '/'], async (req, res) => {
  const cacheKey = 'global_markets_v9';
  const cached = routeCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const data = await Promise.all(GLOBAL_SYMBOLS.map(async (s) => {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?range=1d&interval=1d`;
        const r = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
        const meta = r.data?.chart?.result?.[0]?.meta;
        if (meta && meta.regularMarketPrice) {
          const p = meta.regularMarketPrice;
          const prev = meta.chartPreviousClose || meta.previousClose;
          return { ...s, price: p, changePercent: prev ? ((p - prev) / prev) * 100 : 0 };
        }
      } catch (e) {}
      return { ...s, price: null };
    }));

    // CRITICAL: Filter out nulls and check if we have enough data
    const validData = data.filter(d => d.price !== null);
    
    // If we have no live data, return FALLBACK
    const finalData = validData.length > 0 ? validData : FALLBACK_DATA;

    const result = { data: finalData, timestamp: new Date().toISOString(), isFallback: validData.length === 0 };
    routeCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.json({ data: FALLBACK_DATA, timestamp: new Date().toISOString(), isFallback: true });
  }
});

router.get('/news', async (req, res) => {
  const { q } = req.query;
  const cacheKey = `market_news_${q || 'default'}`;
  const cached = routeCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const query = q || 'India stock market Nifty news';
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const resp = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
    
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(resp.data)) !== null && articles.length < 10) {
      const b = match[1];
      const t = (/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(b) || [])[1] || '';
      const l = (/<link>(.*?)<\/link>/.exec(b) || [])[1] || '';
      const s = (/<source[^>]*>(.*?)<\/source>/.exec(b) || [])[1] || 'News';
      if (t && l) articles.push({ title: t.trim().replace(/^<!\[CDATA\[|\]\]>$/g, ''), url: l.trim(), source: s.trim() });
    }
    const result = { articles, timestamp: new Date().toISOString() };
    routeCache.set(cacheKey, result, 600);
    res.json(result);
  } catch (err) {
    res.json({ articles: [], error: err.message });
  }
});

router.get('/indices', async (req, res) => {
  try {
    const [indices, fiidii] = await Promise.all([
      marketService.getMarketIndices(),
      fiidiiService.getFIIDIIData().catch(() => null),
    ]);
    res.json({ ...indices, fiidii });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now(), v: 'VER_CLEVER_99' }));

module.exports = router;
