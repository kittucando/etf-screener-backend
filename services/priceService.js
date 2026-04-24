const axios = require('axios');
const NodeCache = require('node-cache');

// Cache: 5 minutes TTL
const cache = new NodeCache({ stdTTL: 300 });

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const ALPHA_BASE = 'https://www.alphavantage.co';

async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await axios.get(url, { signal: controller.signal });
    clearTimeout(id);
    return response.data;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function getFinnhubPrice(symbol) {
  try {
    const cacheKey = `finnhub_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const url = `${FINNHUB_BASE}/quote?symbol=${symbol}:NSE&token=${process.env.FINNHUB_KEY}`;
    const data = await fetchWithTimeout(url, 3000);

    if (data.c && data.c > 0 && data.pc > 0) {
      const change = ((data.c - data.pc) / data.pc) * 100;
      const result = {
        symbol,
        price: data.c,
        prevClose: data.pc,
        change,
        source: 'Finnhub',
        timestamp: new Date()
      };
      cache.set(cacheKey, result);
      return result;
    }
  } catch (error) {
    console.warn(`Finnhub error for ${symbol}:`, error.message);
  }
  return null;
}

async function getAlphaVantagePrice(symbol) {
  try {
    const cacheKey = `alpha_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const url = `${ALPHA_BASE}/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
    const data = await fetchWithTimeout(url, 5000);

    const quote = data['Global Quote'];
    if (quote && quote['05. price'] && parseFloat(quote['05. price']) > 0) {
      const price = parseFloat(quote['05. price']);
      const prevClose = parseFloat(quote['08. previous close']);
      
      if (prevClose > 0) {
        const change = ((price - prevClose) / prevClose) * 100;
        const result = {
          symbol,
          price,
          prevClose,
          change,
          source: 'AlphaVantage',
          timestamp: new Date()
        };
        cache.set(cacheKey, result);
        return result;
      }
    }
  } catch (error) {
    console.warn(`AlphaVantage error for ${symbol}:`, error.message);
  }
  return null;
}

// Demo data fallback
const DEMO_PRICES = {
  'NIFTYBEES': 273.50, 'JUNIORBEES': 182.30, 'SENSIBEES': 425.80,
  'MOTILALNET': 380.25, 'GOLDBEES': 65.40, 'SILVERBEES': 82.10,
  'LIQUID': 3890.00, 'ETFMAG': 125.50, 'NIFTYMID': 234.10,
  'NIFTYLOW': 189.75, 'NIFTYPSC': 305.65, 'NIFTYSMALLCAP': 198.90,
  'NIFTYMCAP': 267.30, 'NIFTYLOWVOL': 254.45, 'NIFTYQUALTY': 216.80,
  'MAFANG': 8562.00, 'NETMRG': 9745.00
};

function getDemoPrice(symbol) {
  const basePrice = DEMO_PRICES[symbol] || Math.random() * 1000;
  const change = (Math.random() - 0.5) * 4; // -2% to +2%
  const prevClose = basePrice / (1 + change / 100);
  
  return {
    symbol,
    price: basePrice,
    prevClose,
    change,
    source: 'Demo',
    timestamp: new Date()
  };
}

async function getETFPrice(symbol) {
  // Try Finnhub first (faster)
  let result = await getFinnhubPrice(symbol);
  if (result) return result;

  // Fallback to AlphaVantage
  result = await getAlphaVantagePrice(symbol);
  if (result) return result;

  // Demo data fallback (always return something)
  return getDemoPrice(symbol);
}

async function getMultiplePrices(symbols) {
  return Promise.all(symbols.map(symbol => getETFPrice(symbol)));
}

module.exports = {
  getETFPrice,
  getMultiplePrices,
  getFinnhubPrice,
  getAlphaVantagePrice
};
