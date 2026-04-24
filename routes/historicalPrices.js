const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /api/historical-price?symbol=NIFTYBEES&date=2026-01-01&time=15:00
router.get('/', async (req, res) => {
  const { symbol, date, time } = req.query;
  if (!symbol || !date) return res.status(400).json({ error: 'symbol and date required' });

  try {
    const dateStr = `${date}T${time || '15:00'}:00+05:30`;
    const requestedMs = new Date(dateStr).getTime();
    const daysAgo = (Date.now() - requestedMs) / (1000 * 60 * 60 * 24);

    // Use daily interval for anything older than 55 days (5m data unavailable)
    const useDailyInterval = daysAgo > 55;
    const interval = useDailyInterval ? '1d' : '5m';

    // For daily, fetch a 2-week window around the target date
    const windowMs = useDailyInterval ? 14 * 86400000 : 86400000;
    const period1 = Math.floor((requestedMs - windowMs / 2) / 1000);
    const period2 = Math.floor((requestedMs + windowMs / 2) / 1000);

    const yahooSymbol = `${symbol.toUpperCase()}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&period1=${period1}&period2=${period2}`;

    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    const chart = resp.data?.chart?.result?.[0];
    if (!chart) throw new Error('No data from Yahoo Finance');

    const timestamps = chart.timestamp || [];
    const closes = chart.indicators?.quote?.[0]?.close || [];
    const highs  = chart.indicators?.quote?.[0]?.high  || [];
    const lows   = chart.indicators?.quote?.[0]?.low   || [];

    // Find bar closest to requested time
    let closestIdx = 0, minDiff = Infinity;
    timestamps.forEach((ts, i) => {
      const diff = Math.abs(ts * 1000 - requestedMs);
      if (diff < minDiff && closes[i] != null) { minDiff = diff; closestIdx = i; }
    });

    const price = closes[closestIdx];
    if (price == null) throw new Error('No price data for that date');

    return res.json({
      symbol, date,
      requestedTime: time || '15:00',
      price: parseFloat(price.toFixed(2)),
      high:  parseFloat((highs[closestIdx] || price).toFixed(2)),
      low:   parseFloat((lows[closestIdx]  || price).toFixed(2)),
      interval,
      daysAgo: Math.round(daysAgo),
      source: 'Yahoo Finance'
    });
  } catch (err) {
    console.warn(`[HISTORICAL] ${err.message}`);
    return res.status(404).json({ error: 'Could not fetch historical price', detail: err.message });
  }
});

module.exports = router;
