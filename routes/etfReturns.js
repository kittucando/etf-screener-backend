/**
 * GET /api/etf-returns?symbols=NIFTYBEES,BANKBEES
 * Real 1W/1M/3M/6M/52W returns.
 * Source priority: NSE Historical → Yahoo Finance (fallback)
 */
const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const NodeCache  = require('node-cache');

const cache = new NodeCache({ stdTTL: 6 * 3600 }); // 6h cache

/* ── NSE Session helper ─────────────────────────────────── */
let nseSession = { cookies: '', fetchedAt: 0 };

async function getNSECookies() {
  // Reuse session for 30 minutes
  if (nseSession.cookies && Date.now() - nseSession.fetchedAt < 30 * 60 * 1000) {
    return nseSession.cookies;
  }
  try {
    const res = await axios.get('https://www.nseindia.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 12000, maxRedirects: 5,
    });
    const raw = res.headers['set-cookie'] || [];
    const jar = {};
    raw.forEach(c => {
      const [nv] = c.split(';');
      const eq = nv.indexOf('=');
      if (eq > 0) jar[nv.slice(0, eq).trim()] = nv.slice(eq + 1).trim();
    });
    nseSession.cookies = Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
    nseSession.fetchedAt = Date.now();
  } catch (e) {
    console.warn('[NSE-RETURNS] Session init failed:', e.message);
  }
  return nseSession.cookies;
}

/* ── NSE Historical ─────────────────────────────────────── */
async function fetchNSEHistorical(symbol) {
  const key = `nse_hist_${symbol}`;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const cookies = await getNSECookies();
    const toDate   = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 380 * 86400000).toISOString().split('T')[0];

    const url = `https://www.nseindia.com/api/historical/cm/equity?symbol=${encodeURIComponent(symbol)}&series[]=EQ&from=${fromDate}&to=${toDate}`;

    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nseindia.com/',
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      timeout: 10000,
    });

    const rows = res.data?.data || [];
    if (rows.length < 5) return null;

    // Sort ascending by date
    const sorted = [...rows].sort((a, b) => {
      const da = new Date(a.CH_TIMESTAMP || a.mTIMESTAMP || 0);
      const db = new Date(b.CH_TIMESTAMP || b.mTIMESTAMP || 0);
      return da - db;
    });

    const closes = sorted.map(r => parseFloat(r.CH_CLOSING_PRICE || r.CH_LAST_TRADED_PRICE || 0)).filter(v => v > 0);
    const highs  = sorted.map(r => parseFloat(r.CH_TRADE_HIGH_PRICE || 0)).filter(v => v > 0);
    const lows   = sorted.map(r => parseFloat(r.CH_TRADE_LOW_PRICE  || 0)).filter(v => v > 0);

    const result = { closes, highs, lows, source: 'NSE' };
    cache.set(key, result);
    return result;
  } catch (e) {
    console.warn(`[NSE-RETURNS] NSE historical failed for ${symbol}:`, e.message);
    return null;
  }
}

/* ── Yahoo Finance fallback ─────────────────────────────── */
async function fetchYahooHistorical(symbol) {
  const key = `yf_hist_${symbol}`;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const now    = Math.floor(Date.now() / 1000);
    const oneYr  = now - 380 * 86400;
    // Try both Yahoo subdomains
    let chart = null;
    for (const host of ['query2', 'query1']) {
      try {
        const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&period1=${oneYr}&period2=${now}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
        chart = res.data?.chart?.result?.[0];
        if (chart) break;
      } catch {}
    }
    if (!chart) return null;

    const q       = chart.indicators?.quote?.[0] || {};
    const ts      = chart.timestamp || [];
    const closes  = [], highs = [], lows = [];

    ts.forEach((_, i) => {
      if (q.close?.[i] != null) {
        closes.push(q.close[i]);
        highs.push(q.high?.[i] || q.close[i]);
        lows.push(q.low?.[i]  || q.close[i]);
      }
    });

    const result = { closes, highs, lows, source: 'Yahoo Finance' };
    cache.set(key, result);
    return result;
  } catch (e) {
    console.warn(`[NSE-RETURNS] Yahoo failed for ${symbol}:`, e.message);
    return null;
  }
}

/* ── Calculate returns from sorted daily closes ─────────── */
function calcReturns(data) {
  const { closes, highs, lows } = data;
  if (!closes || closes.length < 5) return null;

  const n   = closes.length;
  const cur = closes[n - 1];
  const at  = d => closes[Math.max(0, n - 1 - d)];

  const wk52High = Math.max(...(highs.length ? highs : closes));
  const wk52Low  = Math.min(...(lows.length  ? lows  : closes));
  const pct52    = wk52High === wk52Low ? 0 : ((cur - wk52Low) / (wk52High - wk52Low)) * 100;

  return {
    weeklyReturn:     +((( cur - at(5))   / at(5))   * 100).toFixed(2),
    monthlyReturn:    +((( cur - at(22))  / at(22))  * 100).toFixed(2),
    threeMonthReturn: +((( cur - at(66))  / at(66))  * 100).toFixed(2),
    sixMonthReturn:   +((( cur - at(130)) / at(130)) * 100).toFixed(2),
    wk52High: +wk52High.toFixed(2),
    wk52Low:  +wk52Low.toFixed(2),
    pct52:    +pct52.toFixed(1),
    source:   data.source,
  };
}

/* ── Batch fetch with concurrency limit ─────────────────── */
async function batchFetch(symbols, concurrency = 5) {
  const results = {};
  for (let i = 0; i < symbols.length; i += concurrency) {
    await Promise.all(
      symbols.slice(i, i + concurrency).map(async sym => {
        // Try NSE first, Yahoo as fallback
        let data = await fetchNSEHistorical(sym);
        if (!data) data = await fetchYahooHistorical(sym);
        if (data) {
          const ret = calcReturns(data);
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
    res.json({
      data,
      fetched:   Object.keys(data).length,
      total:     symbols.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
