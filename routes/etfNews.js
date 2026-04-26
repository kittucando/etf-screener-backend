const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 900 }); // 15 min cache

// Build a meaningful search query from ETF symbol + name
function buildQuery(symbol, name) {
  // For international ETFs like MAFANG (FANG+), add underlying terms
  const fangSymbols = ['MAFANG','FANG'];
  if (fangSymbols.some(s => symbol?.toUpperCase().includes(s))) {
    return 'FANG+ ETF Mirae Asset Meta Apple Amazon Netflix Google stock';
  }
  // For gold ETFs
  if (/GOLD|SILVER/i.test(symbol)) return `${symbol} gold ETF India price`;
  // For banking ETFs
  if (/BANK|BANKBEES/i.test(symbol)) return `${symbol} banking ETF India Nifty Bank`;
  // Default: use name + ETF India
  const shortName = (name || symbol || '').replace(/etf|fund|direct|plan|growth/gi, '').trim().substring(0, 40);
  return `${shortName} ETF India stock market`;
}

// Parse Google News RSS XML without a library
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const block = match[1];
    const title   = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) || /<title>(.*?)<\/title>/.exec(block) || [])[1] || '';
    const link    = (/<link>(.*?)<\/link>/.exec(block) || [])[1] || '';
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(block) || [])[1] || '';
    const source  = (/<source[^>]*>(.*?)<\/source>/.exec(block) || [])[1] || 'Google News';
    if (title) items.push({ title: title.trim(), url: link.trim(), source: source.trim(), publishedAt: pubDate.trim() });
  }
  return items;
}

router.get('/', async (req, res) => {
  const { symbol, name, q } = req.query;
  if (!symbol && !q) return res.status(400).json({ error: 'symbol or q is required' });

  const cacheKey = `etf_news_${q ? Buffer.from(q).toString('base64').slice(0,20) : symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // If q passed directly use it; otherwise build from symbol/name
    const query = q || buildQuery(symbol, name);
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      timeout: 8000,
      responseType: 'text',
    });

    const articles = parseRSS(response.data);
    const result = { symbol, query, articles, timestamp: new Date().toISOString() };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.json({ symbol, articles: [], error: err.message });
  }
});

module.exports = router;
