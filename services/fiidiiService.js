const { NseIndia } = require('stock-nse-india');
const NodeCache = require('node-cache');

// Cache with 30 minutes TTL for FII/DII data (updated less frequently)
const cache = new NodeCache({ stdTTL: 1800 });

// ==================== LOGGING ====================
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [FII/DII SERVICE] [${level}] ${message}`;
  
  if (data) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage, data);
  } else {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](logMessage);
  }
};

// ==================== FETCH FROM NSE FII/DII API ====================
async function fetchFromNSEFIIDIIAPI() {
  try {
    log('INFO', '🔄 Attempting to fetch FII/DII data from NSE via stock-nse-india...');
    
    const nseIndia = new NseIndia();
    const dataArray = await nseIndia.getDataByEndpoint('/api/fiidiiTradeReact');

    if (dataArray && Array.isArray(dataArray) && dataArray.length > 0) {
      log('INFO', '✅ Successfully fetched FII/DII data from NSE API');
      
      // Parse the response
      return parseFIIDIIData(dataArray);
    }
    
    log('WARN', '⚠️  NSE FII/DII API returned empty data');
    return null;
  } catch (error) {
    log('ERROR', '❌ Failed to fetch from NSE FII/DII API', { 
      error: error.message
    });
    return null;
  }
}

// ==================== PARSE FII/DII DATA ====================
function parseFIIDIIData(dataArray) {
  try {
    log('INFO', '🔍 Parsing FII/DII data structure');
    
    let result = {
      fiiData: [],
      diiData: [],
      summary: {},
      timestamp: new Date().toISOString()
    };

    // Date conversion function
    const formatDate = (dateStr) => {
        // e.g., "16-Apr-2026" to "2026-04-16"
        const d = new Date(dateStr);
        return d.toISOString().split('T')[0];
    };

    // Amount conversion: from Crores to absolute Rupees
    const toRupees = (valStr) => parseFloat(valStr || 0) * 10000000;

    dataArray.forEach(item => {
        const parsedItem = {
            date: formatDate(item.date),
            buyAmount: toRupees(item.buyValue),
            sellAmount: toRupees(item.sellValue),
            netAmount: toRupees(item.netValue),
            contracts: 0,
            type: item.category === 'DII' ? 'DII' : 'FII'
        };

        if (item.category === 'DII') {
            result.diiData.push(parsedItem);
        } else {
            result.fiiData.push(parsedItem);
        }
    });

    // Populate summary for FII
    if (result.fiiData.length > 0) {
        const latest = result.fiiData[0]; // assuming latest is [0]
        result.summary.fiiLatest = {
            date: latest.date,
            buyAmount: latest.buyAmount,
            sellAmount: latest.sellAmount,
            netAmount: latest.netAmount,
            trend: latest.netAmount > 0 ? 'BULLISH' : latest.netAmount < 0 ? 'BEARISH' : 'NEUTRAL',
            trendEmoji: latest.netAmount > 0 ? '📈' : latest.netAmount < 0 ? '📉' : '➡️'
        };
    }

    // Populate summary for DII
    if (result.diiData.length > 0) {
        const latest = result.diiData[0];
        result.summary.diiLatest = {
            date: latest.date,
            buyAmount: latest.buyAmount,
            sellAmount: latest.sellAmount,
            netAmount: latest.netAmount,
            trend: latest.netAmount > 0 ? 'BULLISH' : latest.netAmount < 0 ? 'BEARISH' : 'NEUTRAL',
            trendEmoji: latest.netAmount > 0 ? '📈' : latest.netAmount < 0 ? '📉' : '➡️'
        };
    }

    log('INFO', '✅ FII/DII data parsed successfully', {
      fiiCount: result.fiiData.length,
      diiCount: result.diiData.length
    });

    return result;
  } catch (error) {
    log('ERROR', '❌ Error parsing FII/DII data', { error: error.message });
    return null;
  }
}

// ==================== FALLBACK DEMO DATA ====================
function getFallbackFIIDIIData() {
  log('INFO', '📦 Using fallback demo FII/DII data');
  
  const todayDate = new Date();
  todayDate.setMinutes(todayDate.getMinutes() + 330); // Shift to IST offset
  const today = todayDate.toISOString().split('T')[0];
  
  const yesterdayDate = new Date(todayDate.getTime() - 86400000);
  const yesterday = yesterdayDate.toISOString().split('T')[0];
  
  return {
    fiiData: [
      {
        date: yesterday,
        buyAmount: 25000000000, // 2500 crores
        sellAmount: 23000000000, // 2300 crores
        netAmount: 2000000000, // 200 crores
        contracts: 156000,
        type: 'FII'
      },
      {
        date: today,
        buyAmount: 28000000000, // 2800 crores
        sellAmount: 26500000000, // 2650 crores
        netAmount: 1500000000, // 150 crores
        contracts: 142000,
        type: 'FII'
      }
    ],
    diiData: [
      {
        date: yesterday,
        buyAmount: 20000000000, // 2000 crores
        sellAmount: 21500000000, // 2150 crores
        netAmount: -1500000000, // -150 crores
        contracts: 125000,
        type: 'DII'
      },
      {
        date: today,
        buyAmount: 22000000000, // 2200 crores
        sellAmount: 20500000000, // 2050 crores
        netAmount: 1500000000, // 150 crores
        contracts: 138000,
        type: 'DII'
      }
    ],
    summary: {
      fiiLatest: {
        date: today,
        buyAmount: 28000000000,
        sellAmount: 26500000000,
        netAmount: 1500000000,
        trend: 'BULLISH',
        trendEmoji: '📈'
      },
      diiLatest: {
        date: today,
        buyAmount: 22000000000,
        sellAmount: 20500000000,
        netAmount: 1500000000,
        trend: 'BULLISH',
        trendEmoji: '📈'
      }
    },
    timestamp: new Date().toISOString(),
    source: 'Demo'
  };
}

// ==================== MAIN FETCH FUNCTION ====================
async function getFIIDIIData() {
  try {
    // Check cache first
    const cachedData = cache.get('nse_fiidii_data');
    if (cachedData) {
      log('INFO', '📦 Using cached FII/DII data');
      return cachedData;
    }

    // Try NSE API first
    let fiidiiData = await fetchFromNSEFIIDIIAPI();
    
    // Fallback if failed
    if (!fiidiiData || (fiidiiData.fiiData && fiidiiData.fiiData.length === 0)) {
      log('INFO', '📦 NSE API returned empty data or failed, using reliable demo data');
      fiidiiData = getFallbackFIIDIIData();
    } else {
      // Add metadata
      fiidiiData.source = 'NSE API';
    }

    // Cache the result
    cache.set('nse_fiidii_data', fiidiiData);
    
    return fiidiiData;
  } catch (error) {
    log('ERROR', '❌ Critical error in getFIIDIIData', { error: error.message });
    return getFallbackFIIDIIData();
  }
}

// ==================== GET TREND ANALYSIS ====================
function analyzeFIIDIITrend(fiiData, diiData) {
  if (!fiiData || fiiData.length === 0) {
    return { sentiment: 'NEUTRAL', analysis: 'Insufficient data' };
  }

  const latest = fiiData[0]; // changed since now it's only 1 item from NSE or we need to align demo data order if used.
  // Wait! The demo data has latest as the LAST item.
  // FII/DII data from stock-nse-india only gives 1 item (today's data).
  // I should accommodate both.
  const isDemo = fiiData.length > 1;
  const currLatest = isDemo ? fiiData[fiiData.length - 1] : fiiData[0];
  const previous = isDemo ? (fiiData.length > 1 ? fiiData[fiiData.length - 2] : null) : null;

  let sentiment = 'NEUTRAL';
  let analysis = '';

  if (currLatest.netAmount > 0) {
    sentiment = 'BULLISH';
    analysis = 'FII buying pressure - Positive for markets';
    
    if (previous && currLatest.netAmount > previous.netAmount) {
      analysis += ' (Increasing buying)';
    }
  } else if (currLatest.netAmount < 0) {
    sentiment = 'BEARISH';
    analysis = 'FII selling pressure - Caution advised';
    
    if (previous && currLatest.netAmount < previous.netAmount) {
      analysis += ' (Increasing selling)';
    }
  }

  return {
    sentiment,
    analysis,
    netFlow: currLatest.netAmount,
    flowEmoji: currLatest.netAmount > 0 ? '🟢' : currLatest.netAmount < 0 ? '🔴' : '🟡'
  };
}

// ==================== CLEAR CACHE ====================
function clearCache() {
  cache.del('nse_fiidii_data');
  log('INFO', '🗑️  FII/DII cache cleared');
}

module.exports = {
  getFIIDIIData,
  analyzeFIIDIITrend,
  clearCache
};
