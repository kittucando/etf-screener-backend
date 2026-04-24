const express = require('express');
const router = express.Router();
const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5-min cache

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.nseindia.com/'
};

async function getNSEClient() {
  const client = axios.create({ headers: NSE_HEADERS, timeout: 10000 });
  try { await client.get('https://www.nseindia.com/'); } catch (_) {}
  return client;
}

// GET /api/oi-spurts
// Returns: futures OI, options OI summary, top OI gainers
router.get('/', async (req, res) => {
  const cacheKey = 'oi_spurts_data';
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const client = await getNSEClient();

    // Fetch futures OI spurts
    const [futRes, optRes] = await Promise.allSettled([
      client.get('https://www.nseindia.com/api/live-analysis-emerge-oi?type=spurts'),
      client.get('https://www.nseindia.com/api/live-analysis-oi-spurts-underlyings'),
    ]);

    const futData = futRes.status === 'fulfilled' ? futRes.value.data : null;
    const optData = optRes.status === 'fulfilled' ? optRes.value.data : null;

    // Parse futures OI spurts
    const futureSpurts = (futData?.data || []).slice(0, 10).map(item => ({
      symbol:    item.symbol || item.underlying,
      oi:        item.oi || item.openInterest,
      oiChange:  item.oiChange || item.changeinOpenInterest,
      oiChangePct: item.pctChng || item.oiChangePct,
      ltp:       item.ltp || item.lastPrice,
      ltpChange: item.ltpChange || item.pChange,
      type:      'FUTURES',
    }));

    // Parse options OI summary (total calls vs puts OI)
    const optionItems = optData?.data || optData?.oi_underlyings_data || [];
    const optionSpurts = optionItems.slice(0, 10).map(item => ({
      symbol:    item.symbol || item.underlying,
      callOI:    item.CE_sumOI || item.callOI || 0,
      putOI:     item.PE_sumOI || item.putOI || 0,
      pcr:       item.pcr || (item.PE_sumOI && item.CE_sumOI ? (item.PE_sumOI / item.CE_sumOI) : null),
      type:      'OPTIONS',
    }));

    // Fetch total market FnO mood from another NSE endpoint
    let marketMood = null;
    try {
      const moodRes = await client.get('https://www.nseindia.com/api/live-analysis-variations?index=NIFTY');
      const d = moodRes.data;
      const totalCallOI = d?.data?.CE_totalOI || d?.CE_totalOI || null;
      const totalPutOI  = d?.data?.PE_totalOI || d?.PE_totalOI  || null;
      if (totalCallOI && totalPutOI) {
        marketMood = {
          totalCallOI,
          totalPutOI,
          pcr: parseFloat((totalPutOI / totalCallOI).toFixed(3)),
          bias: totalPutOI / totalCallOI > 1.2 ? 'Bullish' : totalPutOI / totalCallOI < 0.8 ? 'Bearish' : 'Neutral',
        };
      }
    } catch (_) {}

    const result = {
      futureSpurts,
      optionSpurts,
      marketMood,
      timestamp: new Date().toISOString(),
      source: 'NSE India'
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.warn('[OI SPURTS] Fetch failed:', err.message);
    res.status(500).json({ error: 'OI data unavailable', detail: err.message });
  }
});

module.exports = router;
