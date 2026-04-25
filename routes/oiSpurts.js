const express = require('express');
const router = express.Router();
const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });

// Improved NSE session: manually extract + replay cookies
async function getNSEClient() {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const cookies = {};

  try {
    const homeRes = await axios.get('https://www.nseindia.com/', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 12000,
      maxRedirects: 5,
    });

    const setCookieHeader = homeRes.headers['set-cookie'];
    if (setCookieHeader) {
      setCookieHeader.forEach(c => {
        const [nv] = c.split(';');
        const eq = nv.indexOf('=');
        if (eq > 0) cookies[nv.slice(0, eq).trim()] = nv.slice(eq + 1).trim();
      });
    }
  } catch (err) {
    console.warn('[NSE] Session init failed:', err.message);
  }

  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

  return axios.create({
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.nseindia.com/market-data/live-equity-market',
      'X-Requested-With': 'XMLHttpRequest',
      'Connection': 'keep-alive',
      ...(cookieStr ? { 'Cookie': cookieStr } : {}),
    },
    timeout: 12000,
  });
}

router.get('/', async (req, res) => {
  const cacheKey = 'oi_spurts_data';
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const client = await getNSEClient();

    const [futRes, optRes, moodRes] = await Promise.allSettled([
      client.get('https://www.nseindia.com/api/live-analysis-emerge-oi?type=spurts'),
      client.get('https://www.nseindia.com/api/live-analysis-oi-spurts-underlyings'),
      client.get('https://www.nseindia.com/api/live-analysis-variations?index=NIFTY'),
    ]);

    const futData  = futRes.status  === 'fulfilled' ? futRes.value.data  : null;
    const optData  = optRes.status  === 'fulfilled' ? optRes.value.data  : null;
    const moodData = moodRes.status === 'fulfilled' ? moodRes.value.data : null;

    const futureSpurts = (futData?.data || []).slice(0, 10).map(item => ({
      symbol:      item.symbol || item.underlying,
      oi:          item.oi || item.openInterest,
      oiChange:    item.oiChange || item.changeinOpenInterest,
      oiChangePct: item.pctChng || item.oiChangePct || 0,
      ltp:         item.ltp || item.lastPrice,
      ltpChange:   item.ltpChange || item.pChange || 0,
      type: 'FUTURES',
    }));

    const optionItems  = optData?.data || optData?.oi_underlyings_data || optData?.oi_data || [];

    // Debug: log first item's keys so we can see real NSE field names
    if (optionItems.length > 0) {
      console.log('[OI] Option item keys:', Object.keys(optionItems[0]).join(', '));
      console.log('[OI] First item sample:', JSON.stringify(optionItems[0]).slice(0, 300));
    }

    const optionSpurts = optionItems.slice(0, 10).map(item => {
      // NSE changes field names regularly — try every known variant
      const ceOI = item.CE_sumOI  || item.CE_totOI   || item.CE?.sumOI  || item.CE?.totOI
                 || item.callOI   || item.ceoi        || item.CE_OI      || item.totOI_CE
                 || item.sumCEOI  || item.sumOI_CE    || 0;
      const peOI = item.PE_sumOI  || item.PE_totOI   || item.PE?.sumOI  || item.PE?.totOI
                 || item.putOI    || item.peoi        || item.PE_OI      || item.totOI_PE
                 || item.sumPEOI  || item.sumOI_PE    || 0;
      const pcr  = item.pcr
                 || (peOI && ceOI ? parseFloat((peOI / ceOI).toFixed(3)) : null);
      return {
        symbol:  item.symbol || item.underlying || item.scripName,
        callOI:  ceOI,
        putOI:   peOI,
        pcr,
        type: 'OPTIONS',
      };
    });

    let marketMood = null;
    if (moodData) {
      const d = moodData?.data || moodData;
      const totalCallOI = d?.CE_totalOI || null;
      const totalPutOI  = d?.PE_totalOI || null;
      if (totalCallOI && totalPutOI) {
        const pcr = parseFloat((totalPutOI / totalCallOI).toFixed(3));
        marketMood = {
          totalCallOI, totalPutOI, pcr,
          bias: pcr > 1.2 ? 'Bullish' : pcr < 0.8 ? 'Bearish' : 'Neutral',
        };
      }
    }

    const hasData = futureSpurts.length > 0 || optionSpurts.length > 0 || marketMood;
    if (!hasData) {
      return res.status(503).json({
        error: 'NSE OI data unavailable',
        reason: 'NSE India blocks cloud server IPs. OI data is accessible during market hours (9:15–15:30 IST) and may require a local server or VPN to fetch reliably.',
        futureSpurts: [], optionSpurts: [], marketMood: null,
        timestamp: new Date().toISOString(),
      });
    }

    const result = { futureSpurts, optionSpurts, marketMood, timestamp: new Date().toISOString(), source: 'NSE India' };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.warn('[OI SPURTS] Fetch failed:', err.message);
    res.json({
      error: 'NSE OI data unavailable',
      reason: err.message,
      futureSpurts: [], optionSpurts: [], marketMood: null,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
