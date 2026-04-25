/**
 * GET /api/etf-returns?symbols=NIFTYBEES,BANKBEES,GOLDBEES
 * Returns real 1W / 1M / 3M / 6M / 52W returns from Yahoo Finance.
 * Results are cached per symbol for 8 hours.
 */
const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 8 * 3600 }); // 8h per symbol

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

/**
 * Fetch 1-year daily bars for one symbol from Yahoo Finance.
 * Returns { prices, timestamps } arrays or null on failure.
 */
async function fetchYahooDaily(symbol) {
  const cacheKey = `yf_daily_${symbol}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  try {
    const now   = Math.floor(Date.now() / 1000);
    const oneYr = now - 365 * 86400;
    const url   = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&period1=${oneYr}&period2=${now}`;

    const resp  = await axios.get(url, { headers: YF_HEADERS, timeout: 10000 });
    const chart = resp.data?.chart?.result?.[0];
    if (!chart) return null;

    const closes     = chart.indicators?.quote?.[0]?.close || [];
    const timestamps = chart.timestamp || [];
    const highs      = chart.indicators?.quote?.[0]?.high  || [];
    const lows       = chart.indicators?.quote?.[0]?.low   || [];

    // Filter out null bars
    const valid = [];
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null) {
        valid.push({ ts: timestamps[i], close: closes[i], high: highs[i], low: lows[i] });
      }
    }

    const result = { valid, fetchedAt: Date.now() };
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[ETF-RETURNS] Yahoo failed for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Calculate returns from sorted daily bars array.
 */
function calcReturns(valid) {
  if (!valid || valid.length < 2) return null;

  const last  = valid[valid.length - 1];
  const cur   = last.close;
  const n     = valid.length;

  const at = (daysAgo) => {
    const idx = Math.max(0, n - 1 - daysAgo);
    return valid[idx].close;
  };

  const wk52High = Math.max(...valid.map(v => v.high || v.close));
  const wk52Low  = Math.min(...valid.map(v => v.low  || v.close));
  const pct52Pos = wk52High === wk52Low ? 0 : ((cur - wk52Low) / (wk52High - wk52Low)) * 100;

  return {
    weeklyReturn:      parseFloat((((cur - at(5))   / at(5))   * 100).toFixed(2)),
    monthlyReturn:     parseFloat((((cur - at(22))  / at(22))  * 100).toFixed(2)),
    threeMonthReturn:  parseFloat((((cur - at(66))  / at(66))  * 100).toFixed(2)),
    sixMonthReturn:    parseFloat((((cur - at(130)) / at(130)) * 100).toFixed(2)),
    wk52High:          parseFloat(wk52High.toFixed(2)),
    wk52Low:           parseFloat(wk52Low.toFixed(2)),
    pct52:             parseFloat(pct52Pos.toFixed(1)),  // % position in 52W range
    currentPrice:      parseFloat(cur.toFixed(2)),
    barsAvailable:     n,
    source:            'Yahoo Finance (real)'
  };
}

// Concurrency limiter — run N promises at a time
async function batchFetch(symbols, concurrency = 6) {
  const results = {};
  const chunks  = [];

  for (let i = 0; i < symbols.length; i += concurrency) {
    chunks.push(symbols.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async sym => {
        const data = await fetchYahooDaily(sym);
        if (data) {
          const ret = calcReturns(data.valid);
          if (ret) results[sym] = ret;
        }
      })
    );
  }

  return results;
}

router.get('/', async (req, res) => {
  const symbolsParam = req.query.symbols || '';
  if (!symbolsParam) return res.status(400).json({ error: 'symbols query param required' });

  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 80);

  try {
    const data = await batchFetch(symbols);
    res.json({ data, fetched: Object.keys(data).length, total: symbols.length, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
