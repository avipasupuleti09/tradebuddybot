import config from './config.js'
import { toFyersTicker } from './utils.js'

const FYERS_API = config.backendApiBase

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Fyers API request failed: ${response.status}`)
  }
  return response.json()
}

function mapCandle(symbol, candle) {
  const [timestamp, open, high, low, close, volume] = candle
  return {
    symbol: toFyersTicker(symbol),
    open: open ?? null,
    high: high ?? null,
    low: low ?? null,
    close: close ?? null,
    volume: volume ?? null,
    date: timestamp ? new Date(timestamp * 1000).toISOString() : null,
  }
}

export async function fetchDailyHistory(symbol, days = config.priceHistoryDays) {
  const fyersSymbol = toFyersTicker(symbol)
  const url = `${FYERS_API}/api/history?symbol=${encodeURIComponent(fyersSymbol)}&resolution=D&days=${days}`
  const data = await fetchJson(url)
  const candles = data.candles || []
  return candles.map((c) => mapCandle(symbol, c)).filter((row) => row.close !== null)
}

export async function fetchBatchDailyHistory(symbols) {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    try {
      return [symbol, await fetchDailyHistory(symbol)]
    } catch {
      return [symbol, []]
    }
  }))
  return Object.fromEntries(entries)
}

export async function fetchIntradayHistory(symbol, days = config.intradayHistoryDays, interval = config.intradayInterval) {
  const fyersSymbol = toFyersTicker(symbol)
  const url = `${FYERS_API}/api/history?symbol=${encodeURIComponent(fyersSymbol)}&resolution=${interval}&days=${days}`
  const data = await fetchJson(url)
  const candles = data.candles || []
  return candles.map((c) => mapCandle(symbol, c)).filter((row) => row.close !== null)
}

export async function fetchBatchIntradayHistory(symbols) {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    try {
      return [symbol, await fetchIntradayHistory(symbol)]
    } catch {
      return [symbol, []]
    }
  }))
  return Object.fromEntries(entries)
}

// Sector lookup via Fyers quotes is not available; use a static NSE sector map
// or return the override from config. Falls back to 'Unknown'.
const NSE_SECTOR_MAP = {
  RELIANCE: 'Oil & Gas', TCS: 'Information Technology', INFY: 'Information Technology',
  HDFCBANK: 'Financial Services', ICICIBANK: 'Financial Services', SBIN: 'Financial Services',
  KOTAKBANK: 'Financial Services', AXISBANK: 'Financial Services', BAJFINANCE: 'Financial Services',
  BAJAJFINSV: 'Financial Services', HCLTECH: 'Information Technology', WIPRO: 'Information Technology',
  TECHM: 'Information Technology', LTIMindtree: 'Information Technology', LTIM: 'Information Technology',
  ITC: 'FMCG', HINDUNILVR: 'FMCG', NESTLEIND: 'FMCG', BRITANNIA: 'FMCG', DABUR: 'FMCG',
  MARICO: 'FMCG', COLPAL: 'FMCG', GODREJCP: 'FMCG', TATACONSUM: 'FMCG',
  BHARTIARTL: 'Telecommunication', JIOFINANCE: 'Financial Services',
  MARUTI: 'Automobile', TATAMOTORS: 'Automobile', M_M: 'Automobile', BAJAJ_AUTO: 'Automobile',
  HEROMOTOCO: 'Automobile', EICHERMOT: 'Automobile', ASHOKLEY: 'Automobile',
  SUNPHARMA: 'Healthcare', DRREDDY: 'Healthcare', CIPLA: 'Healthcare', DIVISLAB: 'Healthcare',
  APOLLOHOSP: 'Healthcare', BIOCON: 'Healthcare', LUPIN: 'Healthcare',
  LT: 'Construction', ADANIENT: 'Metals & Mining', ADANIPORTS: 'Services',
  ADANIGREEN: 'Power', ADANIPOWER: 'Power', NTPC: 'Power', POWERGRID: 'Power', TATAPOWER: 'Power',
  TATASTEEL: 'Metals & Mining', JSWSTEEL: 'Metals & Mining', HINDALCO: 'Metals & Mining',
  COALINDIA: 'Metals & Mining', VEDL: 'Metals & Mining', NMDC: 'Metals & Mining',
  ULTRACEMCO: 'Construction', SHREECEM: 'Construction', AMBUJACEM: 'Construction', ACC: 'Construction',
  GRASIM: 'Construction', TITAN: 'Consumer Durables', ASIANPAINT: 'Consumer Durables',
  BERGEPAINT: 'Consumer Durables', PIDILITIND: 'Chemicals', UPL: 'Chemicals', SRF: 'Chemicals',
  BPCL: 'Oil & Gas', ONGC: 'Oil & Gas', IOC: 'Oil & Gas', HINDPETRO: 'Oil & Gas', GAIL: 'Oil & Gas',
  INDUSINDBK: 'Financial Services', BANKBARODA: 'Financial Services', PNB: 'Financial Services',
  IDFCFIRSTB: 'Financial Services', FEDERALBNK: 'Financial Services', CANBK: 'Financial Services',
  HDFCLIFE: 'Financial Services', SBILIFE: 'Financial Services', ICICIPRULI: 'Financial Services',
  ICICIGI: 'Financial Services', SBICARD: 'Financial Services',
  HAVELLS: 'Consumer Durables', VOLTAS: 'Consumer Durables', WHIRLPOOL: 'Consumer Durables',
  ZOMATO: 'Services', NYKAA: 'Services', PAYTM: 'Financial Services', POLICYBZR: 'Financial Services',
  DMART: 'FMCG', TRENT: 'FMCG',
  PERSISTENT: 'Information Technology', COFORGE: 'Information Technology', MPHASIS: 'Information Technology',
  HAPPSTMNDS: 'Information Technology', LTTS: 'Information Technology',
  HAL: 'Capital Goods', BEL: 'Capital Goods', BHEL: 'Capital Goods',
  IRCTC: 'Services', INDIANHOTEL: 'Services', LEMON: 'Services',
  SIEMENS: 'Capital Goods', ABB: 'Capital Goods', CUMMINSIND: 'Capital Goods',
}

export async function fetchSectorName(symbol) {
  const bare = String(symbol || '').replace(/^NSE:/, '').replace(/-EQ$/, '').replace('.NS', '').toUpperCase()
  return NSE_SECTOR_MAP[bare] || 'Unknown'
}