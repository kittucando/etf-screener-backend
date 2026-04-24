/**
 * Market Stage Analysis
 * Stage 1 (🟢): Accumulation - Sideways near bottom, building support
 * Stage 2 (🚀): Recovery - HH, HL, breaking out higher
 * Stage 3 (🟠): Euphoria - Strong HH, HL, near top
 * Stage 4 (🔴): Distribution - Sideways near top, losing momentum
 * Stage 5 (⚫): Breakdown - Starts LH, LL, breaking support
 * Stage 6 (🔵): Panic - Strong LL, LP, capitulation selling
 */

function analyzeStage(priceHistory) {
  if (!priceHistory || priceHistory.length < 20) {
    return { stage: 0, stageName: 'Unknown', confidence: 0, description: 'Insufficient data' };
  }

  const recent = priceHistory.slice(-20);
  const older = priceHistory.slice(-50, -20);

  // Calculate averages
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  // Calculate volatility
  const recentVol = standardDeviation(recent);
  const olderVol = standardDeviation(older);

  // Trend detection
  const trend = priceHistory[priceHistory.length - 1] > priceHistory[priceHistory.length - 2] ? 'up' : 'down';
  const prevTrend = priceHistory[priceHistory.length - 2] > priceHistory[priceHistory.length - 3] ? 'up' : 'down';

  // Higher Highs / Higher Lows (HH/HL)
  const hasHigherHigh = recent[recent.length - 1] > recent[0];
  const hasHigherLows = recent[recent.length - 1] > recent[recent.length - 10];

  // Lower Highs / Lower Lows (LH/LL)
  const hasLowerHigh = recent[recent.length - 1] < recent[0];
  const hasLowerLows = recent[recent.length - 1] < recent[recent.length - 10];

  // Price position in range
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const pricePosition = (recent[recent.length - 1] - min) / (max - min); // 0 = bottom, 1 = top

  let stage = 0, stageName = 'Unknown', confidence = 0.5;

  if (pricePosition < 0.3 && trend === 'up') {
    stage = 1;
    stageName = 'Accumulation';
    confidence = 0.7;
    // description = '🟢 Building support near bottom';
  } else if (pricePosition < 0.3 && trend === 'down') {
    stage = 6;
    stageName = 'Panic';
    confidence = 0.8;
    // description = '🔵 Strong selling pressure at lows';
  } else if (hasHigherHigh && hasHigherLows && trend === 'up') {
    stage = 2;
    stageName = 'Recovery';
    confidence = 0.75;
    // description = '🚀 Higher Highs & Lows, uptrend confirmed';
  } else if (pricePosition > 0.7 && hasHigherHigh && trend === 'up') {
    stage = 3;
    stageName = 'Euphoria';
    confidence = 0.8;
    // description = '🟠 Strong uptrend near top, euphoria zone';
  } else if (pricePosition > 0.7 && Math.abs(trend === 'up') && recentVol < olderVol) {
    stage = 4;
    stageName = 'Distribution';
    confidence = 0.7;
    // description = '🔴 Losing momentum near highs, distribution';
  } else if (hasLowerHigh && hasLowerLows && trend === 'down') {
    stage = 5;
    stageName = 'Breakdown';
    confidence = 0.75;
    // description = '⚫ Lower Highs & Lows, downtrend confirmed';
  } else {
    stage = 0;
    stageName = 'Consolidating';
    confidence = 0.5;
  }

  return {
    stage,
    stageName,
    confidence: Math.min(confidence, 0.95),
    emoji: getStageEmoji(stage),
    description: getStageDescription(stage),
    pricePosition,
    trend,
    volatility: recentVol
  };
}

function getStageEmoji(stage) {
  const emojis = {
    0: '⚪',
    1: '🟢',
    2: '🚀',
    3: '🟠',
    4: '🔴',
    5: '⚫',
    6: '🔵'
  };
  return emojis[stage] || '⚪';
}

function getStageDescription(stage) {
  const descriptions = {
    0: 'Neutral market, awaiting direction',
    1: 'Building support near bottom - accumulation phase',
    2: 'Higher Highs & Lows - recovery breakout',
    3: 'Strong uptrend near top - euphoria zone',
    4: 'Losing momentum near highs - distribution',
    5: 'Lower Highs & Lows - breakdown confirmed',
    6: 'Strong selling at lows - panic capitulation'
  };
  return descriptions[stage] || 'Unknown stage';
}

function standardDeviation(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

module.exports = {
  analyzeStage,
  getStageEmoji,
  getStageDescription
};
