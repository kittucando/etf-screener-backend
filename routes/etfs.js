const express = require('express');
const router = express.Router();
const etfService = require('../services/etfService');
const stageAnalyzer = require('../services/stageAnalyzer');

// ==================== LOGGING ====================
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ETF ROUTES] [${level}] ${message}`;
  
  if (data) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage, data);
  } else {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage);
  }
};

// Get single ETF with stage analysis
router.get('/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    log('INFO', `📍 Fetching ETF: ${symbol}`);
    
    const etfData = await etfService.getETFBySymbol(symbol);

    if (!etfData) {
      log('WARN', `❌ ETF not found: ${symbol}`);
      return res.status(404).json({ error: 'ETF not found', symbol });
    }

    // Generate dummy price history (in production, fetch from DB)
    const priceHistory = generatePriceHistory(etfData.price, 260);
    const stage = stageAnalyzer.analyzeStage(priceHistory);
    const returns = calculateReturns(priceHistory, etfData.price);
    const technicals = calculateTechnicalIndicators(priceHistory, etfData);
    const chartData = generateChartData(priceHistory);

    res.json({
      ...etfData,
      symbol,
      ...returns,
      technicals,
      ema200: technicals.ema200,
      stage,
      chartData
    });
  } catch (error) {
    log('ERROR', `❌ Error fetching ETF ${req.params.symbol}`, { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get all ETFs with analysis
router.get('/', async (req, res) => {
  try {
    log('INFO', '🔄 Fetching all ETFs from NSE service...');

    const refreshRequested =
      req.query.refresh === '1' ||
      req.query.refresh === 'true';

    const allETFs = await etfService.getETFData(refreshRequested);
    
    if (!allETFs || allETFs.length === 0) {
      log('WARN', '⚠️  No ETFs returned from service');
      return res.status(500).json({ error: 'Failed to fetch ETF data' });
    }

    log('INFO', `✅ Fetched ${allETFs.length} ETFs`);
    
    const etfs = allETFs.map(etfData => {
      const priceHistory = generatePriceHistory(etfData.price, 260);
      const stage = stageAnalyzer.analyzeStage(priceHistory);
      const returns = calculateReturns(priceHistory, etfData.price);
      const technicals = calculateTechnicalIndicators(priceHistory, etfData);
      const chartData = generateChartData(priceHistory);
      const analysts = generateAnalystRecommendation(etfData.symbol, technicals, stage);
      
      // Determine productivity Action Signal
      let actionSignal = 'Normal';
      if (technicals.rsi > 70) actionSignal = 'Overextended';
      else if (technicals.rsi < 30) actionSignal = 'Oversold / Bottoming';
      else if (technicals.rsi > 55 && technicals.macd.histogram > 0 && technicals.volume.ratio > 1.2) actionSignal = 'Bullish Breakout';
      else if (stage.stage === 4 || stage.stage === 5) actionSignal = 'Weakening';
      else if (stage.stage === 1 && technicals.volume.ratio > 1.2) actionSignal = 'Heavy Accumulation';
      else if (technicals.macd.histogram < 0 && technicals.rsi < 50) actionSignal = 'Trend Decay';

      return {
        ...etfData,
        ...returns,
        technicals,
        stage,
        ema200: technicals.ema200,
        chartData,
        weeklyReturn: returns.weeklyReturn,
        monthlyReturn: returns.monthlyReturn,
        threeMonthReturn: returns.threeMonthReturn,
        rsi: technicals.rsi,
        macd: technicals.macd.histogram,
        bb: technicals.bb.position,
        atr: technicals.atr,
        volumeIndicator: technicals.volume.ratio,
        analysts,
        actionSignal
      };
    });

    res.json({
      total: etfs.length,
      loaded: etfs.length,
      data: etfs.sort((a, b) => b.change - a.change),
      timestamp: new Date().toISOString(),
      note: 'ETF data from NSE India API with fallback to Dhan and demo data',
      dataSource: etfs.length > 0 ? etfs[0].source : 'Unknown',
      dataQuality: etfs.some(e => e.source === 'Demo') ? 'DEMO' : 'REAL'
    });
  } catch (error) {
    log('ERROR', '❌ Failed to fetch all ETFs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/:symbol/insights', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const etfData = await etfService.getETFBySymbol(symbol);
    if (!etfData) return res.status(404).json({ error: 'ETF not found' });

    const priceHistory = generatePriceHistory(etfData.price, 260);
    const technicals = calculateTechnicalIndicators(priceHistory, etfData);
    const stage = stageAnalyzer.analyzeStage(priceHistory);
    
    const isGainer = etfData.changePercent >= 0;
    
    // Simulate AI insight reason
    let reason = '';
    const strongMomentum = technicals.rsi > 60;
    const oversold = technicals.rsi < 40;
    const highVolume = technicals.volume.signal === 'High';

    if (isGainer) {
      reason = `${symbol} climbed ${(etfData.changePercent || 0).toFixed(2)}% today. `;
      if (highVolume) reason += "This surge is backed by exceptionally high institutional volume, suggesting strong accumulation. ";
      if (strongMomentum) reason += `The RSI sits strongly at ${technicals.rsi}, confirming clear bullish momentum. `;
      reason += `Currently evaluated in Stage ${stage.stage} (${stage.stageName}), the asset displays structural strength.`;
    } else {
      reason = `${symbol} dropped ${Math.abs(etfData.changePercent || 0).toFixed(2)}% today. `;
      if (highVolume) reason += "The decline comes with heavy volume, indicating significant distribution. ";
      if (oversold) reason += `With RSI at ${technicals.rsi}, the asset is reaching oversold territory and may see a bounce soon. `;
      reason += `Falling under Stage ${stage.stage} (${stage.stageName}), technical caution is advised as momentum weakens.`;
    }

    res.json({
      symbol,
      date: new Date().toISOString(),
      reason,
      metrics: {
        changePercent: etfData.changePercent,
        rsi: technicals.rsi,
        volume: technicals.volume.signal,
        stage: stage.stageName
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generatePriceHistory(currentPrice, days = 260) {
  // Generate realistic price history ending EXACTLY at currentPrice
  const history = [parseFloat(currentPrice.toFixed(2))];
  let price = currentPrice;
  
  for (let i = 1; i < days; i++) {
    const change = (Math.random() - 0.5) * 0.015; // ±0.75% daily volatility
    price = price / (1 + change); // Calculate backwards
    history.unshift(parseFloat(price.toFixed(2))); // Add to beginning (oldest first)
  }

  return history;
}

function calculateReturns(priceHistory, currentPrice) {
  // Calculate returns for different time periods
  // priceHistory is in ascending order (oldest to newest)
  
  if (!priceHistory || priceHistory.length === 0) {
    return { weeklyReturn: 0, monthlyReturn: 0, threeMonthReturn: 0 };
  }

  const days = priceHistory.length;
  
  // Weekly: last 5 trading days
  const weeklyStartPrice = days >= 5 ? priceHistory[days - 5] : priceHistory[0];
  const weeklyReturn = ((currentPrice - weeklyStartPrice) / weeklyStartPrice) * 100;

  // Monthly: last 20 trading days (approximately 1 month)
  const monthlyStartPrice = days >= 20 ? priceHistory[days - 20] : priceHistory[0];
  const monthlyReturn = ((currentPrice - monthlyStartPrice) / monthlyStartPrice) * 100;

  // 3-Month: last 60 trading days (approximately 3 months)
  const threeMonthStartPrice = days >= 60 ? priceHistory[days - 60] : priceHistory[0];
  const threeMonthReturn = ((currentPrice - threeMonthStartPrice) / threeMonthStartPrice) * 100;

  return {
    weeklyReturn: parseFloat(weeklyReturn.toFixed(2)),
    monthlyReturn: parseFloat(monthlyReturn.toFixed(2)),
    threeMonthReturn: parseFloat(threeMonthReturn.toFixed(2))
  };
}

function average(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (!values || values.length === 0) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => Math.pow(value - mean, 2)));
  return Math.sqrt(variance);
}

function calculateEMA(values, period) {
  if (!values || values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(closes) {
  if (!closes || closes.length < 35) {
    return { line: 0, signal: 0, histogram: 0 };
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12 - ema26;

  // Approx signal line from trailing MACD values
  const macdSeries = [];
  for (let i = 26; i < closes.length; i++) {
    const slice = closes.slice(0, i + 1);
    macdSeries.push(calculateEMA(slice, 12) - calculateEMA(slice, 26));
  }
  const signalLine = calculateEMA(macdSeries.slice(-9), 9);
  const histogram = macdLine - signalLine;

  return {
    line: parseFloat(macdLine.toFixed(3)),
    signal: parseFloat(signalLine.toFixed(3)),
    histogram: parseFloat(histogram.toFixed(3))
  };
}

function calculateBollingerBands(closes, period = 20, stdDevMultiplier = 2) {
  if (!closes || closes.length < period) {
    return { upper: 0, middle: 0, lower: 0, position: 0 };
  }

  const recent = closes.slice(-period);
  const middle = average(recent);
  const stdDev = standardDeviation(recent);
  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const current = closes[closes.length - 1];
  const position = upper === lower ? 0 : ((current - lower) / (upper - lower)) * 100;

  return {
    upper: parseFloat(upper.toFixed(2)),
    middle: parseFloat(middle.toFixed(2)),
    lower: parseFloat(lower.toFixed(2)),
    position: parseFloat(position.toFixed(2))
  };
}

function calculateATR(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 0;

  const trueRanges = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    const current = closes[i];
    const prev = closes[i - 1];
    const high = Math.max(current, prev) * 1.005;
    const low = Math.min(current, prev) * 0.995;
    const tr = Math.max(
      high - low,
      Math.abs(high - prev),
      Math.abs(low - prev)
    );
    trueRanges.push(tr);
  }

  return parseFloat(average(trueRanges).toFixed(2));
}

function calculateVolumeIndicator(currentVolume) {
  const volume = Number(currentVolume || 0);
  if (volume <= 0) {
    return { ratio: 0, signal: 'N/A', avgVolume: 0 };
  }

  const avgVolume = volume * (0.65 + Math.random() * 0.5);
  const ratio = avgVolume > 0 ? volume / avgVolume : 0;
  let signal = 'Normal';
  if (ratio >= 1.4) signal = 'High';
  else if (ratio <= 0.8) signal = 'Low';

  return {
    ratio: parseFloat(ratio.toFixed(2)),
    signal,
    avgVolume: Math.round(avgVolume)
  };
}

function calculateTechnicalIndicators(priceHistory, etfData) {
  const closes = priceHistory || [];
  const rsi = parseFloat(calculateRSI(closes).toFixed(2));
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes);
  const atr = calculateATR(closes);
  const volume = calculateVolumeIndicator(etfData.volume);
  const ema200 = calculateEMA(closes, 200);

  return {
    rsi,
    macd,
    bb,
    atr,
    volume,
    ema200: parseFloat(ema200.toFixed(2))
  };
}

function generateChartData(priceHistory) {
  const chartData = [];
  const closes = priceHistory || [];
  const startIndex = Math.max(0, closes.length - 60);

  for (let i = startIndex; i < closes.length; i++) {
    const historicalCloses = closes.slice(0, i + 1);
    const rsi = parseFloat(calculateRSI(historicalCloses).toFixed(2));
    const macd = calculateMACD(historicalCloses);
    const bb = calculateBollingerBands(historicalCloses);
    const atr = calculateATR(historicalCloses);
    const ema200 = calculateEMA(historicalCloses, 200);

    chartData.push({
      day: i - startIndex + 1,
      price: closes[i],
      ema200: parseFloat(ema200.toFixed(2)),
      rsi,
      macdLine: macd.line,
      signalLine: macd.signal,
      histogram: macd.histogram,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      bbMiddle: bb.middle,
      atr
    });
  }
  return chartData;
}

function generateAnalystRecommendation(symbol, technicals, stage) {
  const analystsCovering = Math.floor(Math.random() * 20) + 4; // 4 to 24 analysts
  
  let buy = 0, sell = 0, hold = 0;
  
  if (technicals.rsi > 60 || stage.stage <= 2) {
    buy = Math.floor(analystsCovering * 0.7);
    sell = Math.floor(analystsCovering * 0.05);
  } else if (technicals.rsi < 40 || stage.stage >= 4) {
    sell = Math.floor(analystsCovering * 0.6);
    buy = Math.floor(analystsCovering * 0.1);
  } else {
    buy = Math.floor(analystsCovering * 0.4);
    sell = Math.floor(analystsCovering * 0.3);
  }
  
  hold = analystsCovering - buy - sell;
  
  let consensus = 'Hold';
  if (buy > analystsCovering * 0.6) consensus = 'Strong Buy';
  else if (sell > analystsCovering * 0.6) consensus = 'Strong Sell';
  else if (buy > sell && buy >= hold) consensus = 'Buy';
  else if (sell > buy && sell >= hold) consensus = 'Sell';
  
  let reason = `Consensus maintains a '${consensus}' rating. `;
  if (consensus.includes('Buy')) reason += `Analysts cite strong breakout momentum and structural support near EMA limits.`;
  else if (consensus.includes('Sell')) reason += `Street analysts remain cautious due to weakening momentum and distribution patterns.`;
  else reason += `Wall street recommends accumulating on dips as the asset establishes sideways consolidation.`;
  
  return {
    count: analystsCovering,
    buy,
    sell,
    hold,
    consensus,
    reason
  };
}

module.exports = router;
