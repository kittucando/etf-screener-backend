const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5-minute cache

// NSE API headers to avoid being blocked
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.nseindia.com/',
  'Connection': 'keep-alive',
};

/**
 * Fetch FII/DII data from NSE India
 */
async function fetchFIIDII() {
  const cacheKey = 'fii_dii_data';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // NSE FII/DII API endpoint
    const url = 'https://www.nseindia.com/api/fiiTrades';
    
    const response = await axios.get(url, {
      headers: NSE_HEADERS,
      timeout: 10000,
      validateStatus: () => true // Don't throw on any status
    });

    if (response.status === 200 && response.data) {
      const data = response.data;
      
      // Parse FII/DII data
      const result = {
        fii: {
          net: data.FII?.net || 0,
          buyValue: data.FII?.buyValue || 0,
          sellValue: data.FII?.sellValue || 0,
          trend: determineTrend(data.FII?.net || 0),
          source: 'NSE India (Real)'
        },
        dii: {
          net: data.DII?.net || 0,
          buyValue: data.DII?.buyValue || 0,
          sellValue: data.DII?.sellValue || 0,
          trend: determineTrend(data.DII?.net || 0),
          source: 'NSE India (Real)'
        },
        date: data.Trade_Date || new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      };

      cache.set(cacheKey, result);
      return result;
    }
  } catch (error) {
    console.error('FII/DII API error:', error.message);
  }

  return null;
}

/**
 * Fetch market indices from NSE
 */
async function fetchNSEIndices() {
  const cacheKey = 'nse_indices_real';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = 'https://www.nseindia.com/api/allIndices';
    
    const response = await axios.get(url, {
      headers: NSE_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status === 200 && response.data?.data) {
      const indicesData = response.data.data;
      
      const result = {
        indices: {},
        timestamp: new Date().toISOString(),
        source: 'NSE India (Real)'
      };

      // Parse indices
      indicesData.forEach(idx => {
        if (idx.index === 'Nifty 50' || idx.index === 'NIFTY 50') {
          result.nifty = {
            price: parseFloat(idx.last) || 0,
            change: parseFloat(idx.net_change) || 0,
            changePercent: parseFloat(idx.per_change) || 0,
            source: 'NSE India (Real)'
          };
        }
        if (idx.index === 'Sensex' || idx.index === 'BSE SENSEX') {
          result.sensex = {
            price: parseFloat(idx.last) || 0,
            change: parseFloat(idx.net_change) || 0,
            changePercent: parseFloat(idx.per_change) || 0,
            source: 'NSE India (Real)'
          };
        }
      });

      cache.set(cacheKey, result);
      return result;
    }
  } catch (error) {
    console.error('NSE Indices API error:', error.message);
  }

  return null;
}

/**
 * Fetch India VIX from NSE
 */
async function fetchIndiaVIX() {
  const cacheKey = 'india_vix';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = 'https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY';
    
    const response = await axios.get(url, {
      headers: NSE_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status === 200 && response.data?.records?.underlyingValue) {
      // Try to extract VIX from a dedicated endpoint
      const vixUrl = 'https://www.nseindia.com/api/latestVIX';
      const vixResponse = await axios.get(vixUrl, {
        headers: NSE_HEADERS,
        timeout: 10000,
        validateStatus: () => true
      });

      if (vixResponse.status === 200 && vixResponse.data) {
        const result = {
          value: parseFloat(vixResponse.data.VIX) || 0,
          change: parseFloat(vixResponse.data.change) || 0,
          timestamp: new Date().toISOString(),
          source: 'NSE India VIX (Real)'
        };

        cache.set(cacheKey, result);
        return result;
      }
    }
  } catch (error) {
    console.error('India VIX API error:', error.message);
  }

  return null;
}

/**
 * Fetch stock/ETF price data from NSE
 */
async function fetchNSEPrice(symbol) {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${symbol}`;
    
    const response = await axios.get(url, {
      headers: NSE_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status === 200 && response.data?.info) {
      const info = response.data.info;
      return {
        symbol: symbol,
        price: info.lastPrice || 0,
        change: info.change || 0,
        changePercent: info.pChange || 0,
        open: info.open || 0,
        high: info.high || 0,
        low: info.low || 0,
        volume: info.totalTradedVolume || 0,
        source: 'NSE India (Real)',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error(`NSE Price error for ${symbol}:`, error.message);
  }

  return null;
}

/**
 * Calculate trend based on net value
 */
function determineTrend(netValue) {
  if (netValue > 0) return 'Buying';
  if (netValue < 0) return 'Selling';
  return 'Neutral';
}

/**
 * Get all market data combined
 */
async function getAllMarketData() {
  try {
    const [indices, fiiDii, vix] = await Promise.all([
      fetchNSEIndices(),
      fetchFIIDII(),
      fetchIndiaVIX()
    ]);

    return {
      indices: indices || {},
      fiiDii: fiiDii || {},
      vix: vix || {},
      timestamp: new Date().toISOString(),
      source: 'NSE India (Real Data)'
    };
  } catch (error) {
    console.error('Error fetching market data:', error.message);
    return null;
  }
}

module.exports = {
  fetchFIIDII,
  fetchNSEIndices,
  fetchIndiaVIX,
  fetchNSEPrice,
  getAllMarketData,
  clearCache: () => cache.flushAll()
};
