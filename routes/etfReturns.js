/**
 * GET /api/etf-returns?symbols=NIFTYBEES,BANKBEES
 * Real 1W/1M/3M/6M/52W returns from MFAPI.in (free, no auth, Indian ETF NAVs)
 * Cache per symbol: 6 hours
 */
const express   = require('express');
const router    = express.Router();
const axios     = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 6 * 3600 });

/* ── Symbol → MFAPI scheme code map ──────────────────────
   Generated from MFAPI search results. Add more as needed.
───────────────────────────────────────────────────────── */
const SCHEME_MAP = {
  'NIFTYBEES':     140084, // Nippon India ETF Nifty 50 BeES
  'JUNIORBEES':    140085, // Nippon India ETF Nifty Next 50 Junior BeES
  'BANKBEES':      140086, // Nippon India ETF Bank BeES
  'GOLDBEES':      134822, // Nippon India ETF Gold BeES
  'SETFNIF50':     147663, // SBI ETF Nifty 50
  'SETFNIFBK':     147664, // SBI ETF Nifty Bank
  'KOTAKNIFTY':    120465, // Kotak Nifty ETF
  'KOTAKBKETF':    120466, // Kotak Banking ETF
  'ICICINIFTY':    120843, // ICICI Prudential Nifty ETF
  'ICICIBANK':     120844, // ICICI Prudential Bank ETF
  'HDFCNIFTY':     120841, // HDFC Nifty 50 ETF
  'HDFCBANK':      120842, // HDFC Banking ETF
  'MAFANG':        145552, // Mirae Asset NYSE FANG+ ETF
  'MOM100':        150329, // Motilal Oswal Midcap 100 ETF
  'MON100':        143220, // Motilal Oswal Nasdaq 100 ETF
  'QNIFTY':        149732, // Quantum Nifty 50 ETF
  'BBETF0432':     149250, // Bharat Bond ETF April 2032
  'LIQUIDBEES':    128959, // Nippon India ETF Liquid BeES
  'CPSEETF':       143218, // CPSE ETF
  'SILVERBEES':    149197, // Nippon India ETF Silver BeES
  'ITETF':         137027, // Nippon India ETF IT BeES
  'PHARMABEES':    149198, // Nippon India ETF Pharma BeES
  'DIVOPPBEES':    128638, // Nippon India ETF Nifty Dividend Opp 50
  'INFRABEES':     128637, // Nippon India ETF Infra BeES
  'PSUBNKBEES':    140087, // Nippon India ETF PSU Bank BeES
  'CONSUMBEES':    128636, // Nippon India ETF Consumption
  'SHARIABEES':    140094, // Nippon India ETF Nifty 50 Shariah
  'NIFTYQLITY':    134536, // Edelweiss ETF Nifty 100 Quality 30
  'NIFTYLOW':      152085, // NAVI Nifty 50 ETF
  'GROWWN50ETF':   153699, // Groww Nifty 50 ETF
  'GROWWNN50ETF':  153785, // Groww Nifty Next 50 ETF
  'SETFGOLD':      145548, // SBI Gold ETF
  'AXISGOLD':      145550, // Axis Gold ETF
  'HDFCGOLD':      145551, // HDFC Gold ETF
  'KOTAKGOLD':     134822, // Kotak Gold ETF (same as GOLDBEES scheme)
};

/* ── Lookup scheme code by searching MFAPI ────────────── */
const searchCache = {};
async function findSchemeCode(symbol) {
  if (SCHEME_MAP[symbol]) return SCHEME_MAP[symbol];
  if (searchCache[symbol]) return searchCache[symbol];

  // Try MFAPI search
  const queries = [
    symbol.replace(/ETF|BEES|NIFTY/i, ' ').trim(),
    symbol,
  ];
  for (const q of queries) {
    try {
      const res = await axios.get(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, { timeout: 6000 });
      const results = res.data || [];
      if (results.length > 0) {
        searchCache[symbol] = results[0].schemeCode;
        return results[0].schemeCode;
      }
    } catch {}
  }
  return null;
}

/* ── Fetch 1-year NAV history from MFAPI ─────────────── */
async function fetchMFAPI(symbol) {
  const cacheKey = `mfapi_${symbol}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const schemeCode = await findSchemeCode(symbol);
  if (!schemeCode) {
    console.warn(`[ETF-RETURNS] No scheme code for ${symbol}`);
    return null;
  }

  try {
    const res = await axios.get(`https://api.mfapi.in/mf/${schemeCode}`, { timeout: 10000 });
    const rows = res.data?.data || [];
    if (rows.length < 5) return null;

    // Data is newest-first; reverse to oldest-first
    // date format: "DD-MM-YYYY"
    const sorted = [...rows].reverse();
    // Keep only last 400 entries (>1 year of trading days)
    const recent = sorted.slice(-400);
    const closes = recent.map(r => parseFloat(r.nav)).filter(v => !isNaN(v) && v > 0);

    if (closes.length < 5) return null;

    const result = { closes, source: 'MFAPI (NSE NAV)', schemeCode };
    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.warn(`[ETF-RETURNS] MFAPI failed for ${symbol} (scheme ${schemeCode}):`, e.message);
    return null;
  }
}

/* ── Calculate returns from sorted daily closes ──────── */
function calcReturns(data) {
  const { closes, source } = data;
  if (!closes || closes.length < 5) return null;

  const n   = closes.length;
  const cur = closes[n - 1];
  const at  = d => closes[Math.max(0, n - 1 - d)];

  const wk52High = Math.max(...closes.slice(-252));
  const wk52Low  = Math.min(...closes.slice(-252));
  const pct52    = wk52High === wk52Low ? 0 : ((cur - wk52Low) / (wk52High - wk52Low)) * 100;

  return {
    weeklyReturn:     +((( cur - at(5))   / at(5))   * 100).toFixed(2),
    monthlyReturn:    +((( cur - at(22))  / at(22))  * 100).toFixed(2),
    threeMonthReturn: +((( cur - at(66))  / at(66))  * 100).toFixed(2),
    sixMonthReturn:   +((( cur - at(130)) / at(130)) * 100).toFixed(2),
    wk52High: +wk52High.toFixed(2),
    wk52Low:  +wk52Low.toFixed(2),
    pct52:    +pct52.toFixed(1),
    source,
  };
}

/* ── Batch with concurrency ──────────────────────────── */
async function batchFetch(symbols, concurrency = 6) {
  const results = {};
  for (let i = 0; i < symbols.length; i += concurrency) {
    await Promise.all(
      symbols.slice(i, i + concurrency).map(async sym => {
        const data = await fetchMFAPI(sym);
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
      source:    'MFAPI.in (Indian ETF NAV)',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
