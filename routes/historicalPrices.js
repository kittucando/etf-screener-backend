const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /api/historical-price?symbol=NIFTYBEES&date=2026-04-16&time=11:30
router.get('/', async (req, res) => {
  const { symbol, date, time } = req.query;
  if (!symbol || !date) return res.status(400).json({ error: 'symbol and date required' });

  try {
    // Build unix timestamps for the requested day (IST = UTC+5:30)
    const dateStr = `${date}T${time || '09:15'}:00+05:30`;
    const requestedMs = new Date(dateStr).getTime();
    const startOfDay = new Date(`${date}T00:00:00+05:30`).getTime();
    const endOfDay   = new Date(`${date}T23:59:59+05:30`).getTime();

    const period1 = Math.floor(startOfDay / 1000);
    const period2 = Math.floor(endOfDay   / 1000);

    // Try NSE-traded symbol first (append .NS for Yahoo)
    const yahooSymbol = `${symbol.toUpperCase()}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&period1=${period1}&period2=${period2}`;

    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    const chart = resp.data?.chart?.result?.[0];
    if (!chart) throw new Error('No data from Yahoo Finance');

    const timestamps = chart.timestamp || [];
    const closes     = chart.indicators?.quote?.[0]?.close || [];
    const highs      = chart.indicators?.quote?.[0]?.high  || [];
    const lows       = chart.indicators?.quote?.[0]?.low   || [];

    // Find bar closest to requested time
    let closestIdx = 0;
    let minDiff = Infinity;
    timestamps.forEach((ts, i) => {
      const diff = Math.abs(ts * 1000 - requestedMs);
      if (diff < minDiff && closes[i] != null) { minDiff = diff; closestIdx = i; }
    });

    const price = closes[closestIdx];
    const high  = highs[closestIdx];
    const low   = lows[closestIdx];
    const actualTime = new Date(timestamps[closestIdx] * 1000)
      .toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

    return res.json({
      symbol,
      date,
      requestedTime: time || '09:15',
      actualTime,
      price: parseFloat(price?.toFixed(2)),
      high:  parseFloat(high?.toFixed(2)),
      low:   parseFloat(low?.toFixed(2)),
      source: 'Yahoo Finance'
    });
  } catch (err) {
    console.warn(`[HISTORICAL] ${err.message}`);
    return res.status(404).json({ error: 'Could not fetch historical price', detail: err.message });
  }
});

module.exports = router;
