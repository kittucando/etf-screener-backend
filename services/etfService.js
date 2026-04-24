const axios = require('axios');
const NodeCache = require('node-cache');

// Cache with 1 hour TTL
const cache = new NodeCache({ stdTTL: 3600 });
const ETF_CACHE_KEY = 'nse_etf_data_v2';

// ==================== LOGGING ====================
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ETF SERVICE] [${level}] ${message}`;
  
  if (data) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage, data);
  } else {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage);
  }
};

// ==================== ETF CATEGORY CLASSIFIER ====================
function classifyETFCategory(symbol, name) {
  const s = (symbol || '').toUpperCase();
  const n = (name || '').toUpperCase();
  const combined = s + ' ' + n;

  if (/GOLD|SILV|METAL|COMMODITY/.test(combined)) return 'Commodity';
  if (/LIQUID|OVERNIGHT|MONEY MARKET/.test(combined)) return 'Liquid / Money Market';
  if (/GILT|GSEC|G-SEC|GOVT BOND|BOND|DEBT/.test(combined)) return 'Debt';
  if (/PHARMA|HEALTH|MEDIC/.test(combined)) return 'Equity - Pharma';
  if (/BANK|FIN|NBFC|PSU BANK/.test(combined)) return 'Equity - Banking';
  if (/IT|TECH|INFOTECH|SOFTWARE/.test(combined)) return 'Equity - IT';
  if (/INFRA|REALTY|REAL ESTATE/.test(combined)) return 'Equity - Infra';
  if (/MIDCAP|MID CAP|JUNIOR|NIFTY NEXT/.test(combined)) return 'Equity - Mid Cap';
  if (/SMALLCAP|SMALL CAP/.test(combined)) return 'Equity - Small Cap';
  if (/CONSUME|FMCG|RETAIL/.test(combined)) return 'Equity - FMCG';
  if (/ENERGY|OIL|PETRO|POWER|UTIL/.test(combined)) return 'Equity - Energy';
  if (/NIFTY|SENSEX|BEES|INDEX|LARGE|BLUE/.test(combined)) return 'Equity - Large Cap';
  if (/INTL|US|NASDAQ|S&P|GLOBAL|WORLD/.test(combined)) return 'International';
  return 'Equity';
}

// ==================== FETCH FROM NSE API ====================
async function fetchFromNSEAPI() {
  try {
    log('INFO', '🔄 Attempting to fetch ETF data from NSE API...');
    
    const response = await axios.get('https://www.nseindia.com/api/etf', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com/'
      },
      timeout: 10000
    });

    if (response.data && response.data.data) {
      log('INFO', '✅ Successfully fetched ETF data from NSE API', { 
        count: response.data.data.length 
      });
      
      // Log sample data to understand structure
      if (response.data.data.length > 0) {
        log('INFO', '📝 Sample NSE ETF structure:', response.data.data[0]);
      }
      
      // Transform NSE data to our format - NSE API returns data with specific field names
      return response.data.data.map(etf => {
        // NSE API field mapping (adjust based on actual response)
        // Note: ltP is the last traded price from NSE API
        const symbol = etf.symbol || etf.scripCode || etf.code || 'N/A';
        const fullName =
          etf.meta?.companyName ||
          etf.companyName ||
          etf.assets ||
          etf.meta?.symbol ||
          etf.name ||
          symbol;
        const currentPrice = parseFloat(etf.ltP || etf.closeprice || etf.close || etf.price || etf.ltp || 0);
        const changeValue = parseFloat(etf.chn || etf.change || etf.chg || 0);
        const changePercent = parseFloat(etf.per || etf.changepercent || etf.chgPercent || (changeValue > 0 ? (changeValue / (currentPrice - changeValue)) * 100 : 0));
        
        return {
          symbol: String(symbol).toUpperCase(),
          name: fullName,
          fullName,
          sector: classifyETFCategory(symbol, fullName),
          category: classifyETFCategory(symbol, fullName),
          price: currentPrice,
          change: parseFloat(changeValue.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
          volume: parseInt(etf.qty || etf.trdVol || etf.volume || etf.vol || 0) || 0,
          dayHigh: parseFloat(etf.high || etf.dayHigh || 0),
          dayLow: parseFloat(etf.low || etf.dayLow || 0),
          open: parseFloat(etf.open || 0),
          prevClose: parseFloat(etf.prevClose || etf.prevclose || 0),
          wk52High: parseFloat(etf.yHigh || etf.wkHigh || etf.high52 || etf['52W H'] || 0) || null,
          wk52Low:  parseFloat(etf.yLow  || etf.wkLow  || etf.low52  || etf['52W L'] || 0) || null,
          source: 'NSE API',
          timestamp: new Date().toISOString()
        };
      }).filter(etf => etf.price > 0); // Filter out ETFs with zero price
    }
    
    log('WARN', '⚠️  NSE API returned empty data');
    return null;
  } catch (error) {
    log('ERROR', '❌ Failed to fetch from NSE API', { 
      error: error.message,
      status: error.response?.status
    });
    return null;
  }
}

// ==================== FETCH FROM DHAN ====================
async function fetchFromDhan() {
  try {
    log('INFO', '🔄 Attempting to fetch ETF data from Dhan...');
    
    const response = await axios.get('https://api.dhan.co/etfs', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && Array.isArray(response.data)) {
      log('INFO', '✅ Successfully fetched ETF data from Dhan', { 
        count: response.data.length 
      });
      
      return response.data.map(etf => ({
        symbol: etf.symbol || 'N/A',
        name: etf.name || 'Unknown',
        sector: etf.sector || 'Equity',
        category: etf.category || 'Unknown',
        price: parseFloat(etf.price || 0),
        change: parseFloat(etf.change || 0),
        changePercent: parseFloat(etf.changePercent || 0),
        volume: parseInt(etf.volume || 0),
        source: 'Dhan API',
        timestamp: new Date().toISOString()
      }));
    }
    
    log('WARN', '⚠️  Dhan API returned empty data');
    return null;
  } catch (error) {
    log('ERROR', '❌ Failed to fetch from Dhan', { 
      error: error.message 
    });
    return null;
  }
}

// ==================== FALLBACK DEMO DATA ====================
function getFallbackETFData() {
  log('INFO', '📦 Using fallback demo ETF data');
  
  return [
    {
      symbol: 'NIFTYBEES',
      name: 'Nifty BeES',
      sector: 'Equity',
      category: 'Equity - Large Cap',
      price: 234.50,
      change: 2.15,
      changePercent: 0.92,
      volume: 5234000,
      source: 'Demo',
      timestamp: new Date().toISOString()
    },
    {
      symbol: 'JUNIORBEES',
      name: 'Junior BeES',
      sector: 'Equity',
      category: 'Equity - Mid Cap',
      price: 189.75,
      change: 3.25,
      changePercent: 1.74,
      volume: 3456000,
      source: 'Demo',
      timestamp: new Date().toISOString()
    },
    {
      symbol: 'BANKBEES',
      name: 'Bank BeES',
      sector: 'Banking & Finance',
      category: 'Equity - Bank',
      price: 456.80,
      change: -1.50,
      changePercent: -0.33,
      volume: 2345000,
      source: 'Demo',
      timestamp: new Date().toISOString()
    },
    {
      symbol: 'GOLDBEES',
      name: 'Gold BeES',
      sector: 'Commodity',
      category: 'Commodity - Gold',
      price: 789.25,
      change: 5.60,
      changePercent: 0.72,
      volume: 1234000,
      source: 'Demo',
      timestamp: new Date().toISOString()
    },
    {
      symbol: 'SETFNIFBK',
      name: 'SBI Nifty Bank',
      sector: 'Banking & Finance',
      category: 'Equity - Bank',
      price: 512.40,
      change: 1.80,
      changePercent: 0.35,
      volume: 1890000,
      source: 'Demo',
      timestamp: new Date().toISOString()
    }
  ];
}

// ==================== MAIN FETCH FUNCTION ====================
async function getETFData(forceRefresh = false) {
  try {
    // Check cache first
    const cachedData = cache.get(ETF_CACHE_KEY);
    if (!forceRefresh && cachedData) {
      log('INFO', '📦 Using cached ETF data');
      return cachedData;
    }

    if (forceRefresh) {
      log('INFO', '🔄 Force refresh requested - bypassing ETF cache');
    }

    // Try NSE API first (primary source)
    let etfData = await fetchFromNSEAPI();
    
    // Fallback to Dhan if NSE fails
    if (!etfData) {
      log('INFO', '↪️  Trying fallback source: Dhan');
      etfData = await fetchFromDhan();
    }
    
    // Final fallback to demo data
    if (!etfData) {
      log('WARN', '⚠️  All API sources failed, using demo data');
      etfData = getFallbackETFData();
    }

    // Cache the result
    cache.set(ETF_CACHE_KEY, etfData);
    
    return etfData;
  } catch (error) {
    log('ERROR', '❌ Critical error in getETFData', { error: error.message });
    return getFallbackETFData();
  }
}

// ==================== GET SPECIFIC ETF ====================
async function getETFBySymbol(symbol) {
  try {
    const allETFs = await getETFData();
    const etf = allETFs.find(e => e.symbol.toUpperCase() === symbol.toUpperCase());
    
    if (etf) {
      log('INFO', `✅ Found ETF: ${symbol}`, { price: etf.price });
      return etf;
    }
    
    log('WARN', `⚠️  ETF not found: ${symbol}`);
    return null;
  } catch (error) {
    log('ERROR', `❌ Failed to get ETF ${symbol}`, { error: error.message });
    return null;
  }
}

// ==================== CLEAR CACHE ====================
function clearCache() {
  cache.del(ETF_CACHE_KEY);
  log('INFO', '🗑️  ETF cache cleared');
}

module.exports = {
  getETFData,
  getETFBySymbol,
  clearCache
};
