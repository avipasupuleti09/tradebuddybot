import fs from 'node:fs/promises';
import path from 'node:path';

import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';

import { FyersApiService } from './api.js';
import { FyersAuthService, MissingBrokerPinError, PinVerificationError } from './auth.js';
import { getSettings, readFrontendUrl, resolveProjectPath } from './config.js';
import { ensureStaticIp } from './network.js';
import { OrderEventHub } from './orderHub.js';
import { QuoteStreamHub } from './quoteHub.js';
import { SymbolMaster } from './symbols.js';
import { TokenStore } from './tokenStore.js';
import {
  asNumber,
  checkTrigger,
  computeRsi,
  linearSlope,
  mapOrderType,
  mapSide,
  mapWithConcurrency,
  mean,
  minMaxNormalize,
  normalizeSymbol,
  percentChange,
  rollingMean,
  safeRound,
  simpleMovingAverage,
  uniqueSymbolsFromRows,
} from './utils.js';

const MAX_ANALYTICS_SYMBOLS = 50;
const MAX_DIRECT_SCREENER_SYMBOLS = 350;
const ANALYTICS_HISTORY_YEARS = 1;
const ANALYTICS_CACHE_TTL_SECONDS = 6 * 60 * 60;
const DIRECT_DAILY_HISTORY_DAYS = 365;
const DIRECT_INTRADAY_HISTORY_DAYS = 5;
const DIRECT_INTRADAY_RESOLUTION = '5';
const DIRECT_LOOKBACK_52W = 252;
const DIRECT_NEAR_PCT_52W = 0.25;
const DIRECT_MA50 = 50;
const DIRECT_MA200 = 200;
const DIRECT_VOL_SPIKE_MULT = 1.5;
const DIRECT_VOL_BREAKOUT_MULT = 2.0;
const DIRECT_GAP_UP_PCT = 2.0;
const DIRECT_ATR_PERIOD = 14;
const DIRECT_ATR_STOP_MULT = 2.0;
const DIRECT_RISK_PER_TRADE_INR = 1000;
const DIRECT_SR_LOOKBACK_DAYS = 60;
const DIRECT_CMF_PERIOD = 20;
const DIRECT_OBV_SLOPE_DAYS = 20;
const DIRECT_ACCUM_SCORE_MIN = 60;
const DIRECT_AI_PROB_MIN = 0.55;
const DIRECT_BENCHMARK_SYMBOL = 'NSE:NIFTY50-INDEX';
const DIRECT_INTRADAY_LIVE_SYMBOL_LIMIT = 25;
const MAX_INTRADAY_DAYS = 100;
const HISTORY_CHUNK_DAYS = 365;
const ANALYTICS_CHUNK_DAYS = HISTORY_CHUNK_DAYS;
const ANALYTICS_CONCURRENCY = 2;
const DIRECT_SCREENER_CONCURRENCY = 2;
const PRICE_ALERT_DEFAULT_AGENT = 'fyers-api';
const DAILY_HISTORY_CACHE_TTL_SECONDS = 10 * 60;
const INTRADAY_HISTORY_CACHE_TTL_SECONDS = 3 * 60;
const DAILY_HISTORY_STALE_TTL_SECONDS = 3 * 24 * 60 * 60;
const INTRADAY_HISTORY_STALE_TTL_SECONDS = 15 * 60;
const HISTORY_ROWS_CACHE_PERSIST_DEBOUNCE_MS = 1500;
const ACCOUNT_PROFILE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'state', 'city', 'timezone'];
const ACCOUNT_PROFILE_DIRNAME = 'profile';
const ACCOUNT_PROFILE_FILENAME = 'account-profile.json';
const ACCOUNT_AVATAR_FILENAME = 'avatar.jpeg';
const ACCOUNT_AVATAR_ROUTE = '/api/profile/avatar';
const MAX_ACCOUNT_PROFILE_FIELD_LENGTH = 160;
const MAX_ACCOUNT_AVATAR_BYTES = 1024 * 1024;

function sanitizeAccountProfilePayload(payload = {}) {
  const normalized = {};
  for (const field of ACCOUNT_PROFILE_FIELDS) {
    normalized[field] = String(payload?.[field] || '').trim().slice(0, MAX_ACCOUNT_PROFILE_FIELD_LENGTH);
  }
  return normalized;
}

function decodeJpegDataUrl(dataUrl) {
  const match = /^data:image\/(?:jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) {
    throw new Error('Profile picture must be uploaded as a JPEG image.');
  }

  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length) {
    throw new Error('Profile picture upload is empty.');
  }
  if (buffer.length > MAX_ACCOUNT_AVATAR_BYTES) {
    throw new Error('Profile picture is too large. Please upload a smaller image.');
  }
  return buffer;
}

function sanitizeAccountAvatarBasename(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || 'avatar';
}

function buildAccountAvatarFilename(accountId) {
  return `${sanitizeAccountAvatarBasename(accountId)}.jpeg`;
}

const directSectorMap = {
  RELIANCE: 'Oil & Gas',
  TCS: 'Information Technology',
  INFY: 'Information Technology',
  HDFCBANK: 'Financial Services',
  ICICIBANK: 'Financial Services',
  SBIN: 'Financial Services',
  KOTAKBANK: 'Financial Services',
  AXISBANK: 'Financial Services',
  BAJFINANCE: 'Financial Services',
  BAJAJFINSV: 'Financial Services',
  HCLTECH: 'Information Technology',
  WIPRO: 'Information Technology',
  TECHM: 'Information Technology',
  LTIMINDTREE: 'Information Technology',
  LTIM: 'Information Technology',
  ITC: 'FMCG',
  HINDUNILVR: 'FMCG',
  NESTLEIND: 'FMCG',
  BRITANNIA: 'FMCG',
  DABUR: 'FMCG',
  MARICO: 'FMCG',
  COLPAL: 'FMCG',
  GODREJCP: 'FMCG',
  TATACONSUM: 'FMCG',
  BHARTIARTL: 'Telecommunication',
  JIOFIN: 'Financial Services',
  MARUTI: 'Automobile',
  TATAMOTORS: 'Automobile',
  'M&M': 'Automobile',
  'BAJAJ-AUTO': 'Automobile',
  HEROMOTOCO: 'Automobile',
  EICHERMOT: 'Automobile',
  ASHOKLEY: 'Automobile',
  SUNPHARMA: 'Healthcare',
  DRREDDY: 'Healthcare',
  CIPLA: 'Healthcare',
  DIVISLAB: 'Healthcare',
  APOLLOHOSP: 'Healthcare',
  BIOCON: 'Healthcare',
  LUPIN: 'Healthcare',
  LT: 'Construction',
  ADANIENT: 'Metals & Mining',
  ADANIPORTS: 'Services',
  ADANIGREEN: 'Power',
  ADANIPOWER: 'Power',
  NTPC: 'Power',
  POWERGRID: 'Power',
  TATAPOWER: 'Power',
  TATASTEEL: 'Metals & Mining',
  JSWSTEEL: 'Metals & Mining',
  HINDALCO: 'Metals & Mining',
  COALINDIA: 'Metals & Mining',
  VEDL: 'Metals & Mining',
  NMDC: 'Metals & Mining',
  ULTRACEMCO: 'Construction',
  SHREECEM: 'Construction',
  AMBUJACEM: 'Construction',
  ACC: 'Construction',
  GRASIM: 'Construction',
  TITAN: 'Consumer Durables',
  ASIANPAINT: 'Consumer Durables',
  BERGEPAINT: 'Consumer Durables',
  PIDILITIND: 'Chemicals',
  UPL: 'Chemicals',
  SRF: 'Chemicals',
  BPCL: 'Oil & Gas',
  ONGC: 'Oil & Gas',
  IOC: 'Oil & Gas',
  HINDPETRO: 'Oil & Gas',
  GAIL: 'Oil & Gas',
  INDUSINDBK: 'Financial Services',
  BANKBARODA: 'Financial Services',
  PNB: 'Financial Services',
  IDFCFIRSTB: 'Financial Services',
  FEDERALBNK: 'Financial Services',
  CANBK: 'Financial Services',
  HDFCLIFE: 'Financial Services',
  SBILIFE: 'Financial Services',
  ICICIPRULI: 'Financial Services',
  ICICIGI: 'Financial Services',
  SBICARD: 'Financial Services',
  HAVELLS: 'Consumer Durables',
  VOLTAS: 'Consumer Durables',
  WHIRLPOOL: 'Consumer Durables',
  ZOMATO: 'Services',
  NYKAA: 'Services',
  PAYTM: 'Financial Services',
  POLICYBZR: 'Financial Services',
  DMART: 'FMCG',
  TRENT: 'FMCG',
  PERSISTENT: 'Information Technology',
  COFORGE: 'Information Technology',
  MPHASIS: 'Information Technology',
  HAPPSTMNDS: 'Information Technology',
  LTTS: 'Information Technology',
  HAL: 'Capital Goods',
  BEL: 'Capital Goods',
  BHEL: 'Capital Goods',
  IRCTC: 'Services',
  INDIANHOTEL: 'Services',
  LEMONTREE: 'Services',
  SIEMENS: 'Capital Goods',
  ABB: 'Capital Goods',
  CUMMINSIND: 'Capital Goods',
};

function currentDateUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(dateValue, days) {
  const next = new Date(dateValue);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDateFromUnixSeconds(seconds) {
  return new Date(Number(seconds) * 1000).toISOString();
}

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

function parseBooleanFlag(value) {
  const normalized = asTrimmedString(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function ensureBrokerOk(result, fallbackMessage) {
  const status = asTrimmedString(result?.s || result?.status).toLowerCase();
  if (status && status !== 'ok') {
    throw new Error(result?.message || fallbackMessage);
  }
  return result;
}

function normalizePriceAlertRecord(alertId, entry) {
  const alert = entry?.alert || {};
  return {
    alertId: String(alertId),
    fyToken: entry?.fyToken || null,
    symbol: normalizeSymbol(entry?.symbol || alert?.symbol || ''),
    name: alert?.name || '',
    alertType: asNumber(alert?.['alert-type'] ?? alert?.alertType ?? alert?.type) ?? null,
    comparisonType: alert?.comparisonType || '',
    condition: alert?.condition || '',
    value: alert?.value ?? '',
    notes: alert?.notes || '',
    status: alert?.status ?? null,
    createdAt: alert?.createdAt || null,
    createdEpoch: asNumber(alert?.createdEpoch),
    raw: entry,
  };
}

function buildPriceAlertList(result) {
  return Object.entries(result?.data || {})
    .map(([alertId, entry]) => normalizePriceAlertRecord(alertId, entry))
    .sort((left, right) => (right.createdEpoch || 0) - (left.createdEpoch || 0));
}

function buildPriceAlertPayload(body, { requireAlertId = false } = {}) {
  const alertId = asTrimmedString(body?.alertId);
  if (requireAlertId && !alertId) {
    throw new Error('alertId is required');
  }

  const name = asTrimmedString(body?.name);
  const symbol = normalizeSymbol(body?.symbol || '');
  const comparisonType = asTrimmedString(body?.comparisonType).toUpperCase();
  const condition = asTrimmedString(body?.condition).toUpperCase();
  const value = asTrimmedString(body?.value);

  if (!name) {
    throw new Error('name is required');
  }
  if (!symbol) {
    throw new Error('symbol is required');
  }
  if (!comparisonType) {
    throw new Error('comparisonType is required');
  }
  if (!condition) {
    throw new Error('condition is required');
  }
  if (!value) {
    throw new Error('value is required');
  }

  const alertType = Number(body?.alertType ?? body?.['alert-type'] ?? 1);
  const payload = {
    agent: asTrimmedString(body?.agent) || PRICE_ALERT_DEFAULT_AGENT,
    'alert-type': Number.isFinite(alertType) ? alertType : 1,
    name,
    symbol,
    comparisonType,
    condition,
    value,
  };

  if (requireAlertId) {
    payload.alertId = alertId;
  }

  const notes = asTrimmedString(body?.notes);
  if (notes) {
    payload.notes = notes;
  }

  return payload;
}

function summarizeDashboard(holdings, positions, funds) {
  const holdingsRows = holdings?.holdings || [];
  const positionRows = positions?.netPositions || [];
  const fundRows = funds?.fund_limit || [];

  const holdingsPnl = holdingsRows.reduce((sum, item) => sum + (asNumber(item?.pnl) || 0), 0);
  const positionsPnl = positionRows.reduce((sum, item) => sum + (asNumber(item?.pl) || asNumber(item?.pnl) || 0), 0);
  const investedValue = holdingsRows.reduce((sum, item) => {
    return sum + ((asNumber(item?.costPrice) || 0) * (asNumber(item?.quantity) || 0));
  }, 0);
  const availableBalance = fundRows.length ? (asNumber(fundRows[0]?.equityAmount) || 0) : 0;

  return {
    holdings_pnl: holdingsPnl,
    positions_pnl: positionsPnl,
    total_pnl: holdingsPnl + positionsPnl,
    invested_value: investedValue,
    available_balance: availableBalance,
  };
}

async function buildDashboardPayload(api) {
  const profile = await api.profile();
  const holdings = await api.holdings();
  const positions = await api.positions();
  const funds = await api.funds();
  const orderbook = await api.orderbook();
  const tradebook = await api.tradebook();

  return {
    status: 'ok',
    profile,
    holdings,
    positions,
    funds,
    orderbook,
    tradebook,
    summary: summarizeDashboard(holdings, positions, funds),
  };
}

function quoteMap(data) {
  const quotes = {};
  for (const row of data?.d || []) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const payload = row.v || {};
    const symbol = normalizeSymbol(row.n || payload.symbol);
    if (symbol) {
      quotes[symbol] = payload;
    }
  }
  return quotes;
}

function previousSession(candles) {
  const today = currentDateUtc().toISOString().slice(0, 10);
  let previousCandle = null;

  for (let index = candles.length - 1; index >= 0; index -= 1) {
    const candle = candles[index];
    const candleDate = new Date(Number(candle[0]) * 1000).toISOString().slice(0, 10);
    if (candleDate < today) {
      previousCandle = candle;
      break;
    }
  }

  if (!previousCandle) {
    previousCandle = candles.length >= 2 ? candles[candles.length - 2] : (candles[candles.length - 1] || null);
  }

  if (!previousCandle) {
    return { date: null, open: null, close: null };
  }

  return {
    date: new Date(Number(previousCandle[0]) * 1000).toISOString().slice(0, 10),
    open: asNumber(previousCandle[1]),
    close: asNumber(previousCandle[4]),
  };
}

function signalFromCandles(candles) {
  const closes = candles
    .map((candle) => asNumber(candle?.[4]))
    .filter((value) => value !== null);

  if (closes.length < 60) {
    return {
      signal: 'Skip',
      score: 0,
      note: 'Insufficient daily history',
      history_points: closes.length,
    };
  }

  const lastClose = closes[closes.length - 1];
  const sma20 = simpleMovingAverage(closes, 20);
  const sma50 = simpleMovingAverage(closes, 50);
  const sma200 = simpleMovingAverage(closes, 200);
  const rsi14 = computeRsi(closes, 14);
  const ret20 = percentChange(lastClose, closes.length > 20 ? closes[closes.length - 21] : null);
  const ret60 = percentChange(lastClose, closes.length > 60 ? closes[closes.length - 61] : null);
  const ret252 = percentChange(lastClose, closes.length > 252 ? closes[closes.length - 253] : null);
  const high52 = closes.length >= 252 ? Math.max(...closes.slice(-252)) : Math.max(...closes);
  const low52 = closes.length >= 252 ? Math.min(...closes.slice(-252)) : Math.min(...closes);

  let score = 0;
  const notes = [];

  if (sma20 !== null) {
    if (lastClose > sma20) {
      score += 1;
      notes.push('price above 20DMA');
    } else {
      score -= 1;
    }
  }
  if (sma50 !== null) {
    if (lastClose > sma50) {
      score += 1;
      notes.push('price above 50DMA');
    } else {
      score -= 1;
    }
  }
  if (sma200 !== null) {
    if (lastClose > sma200) {
      score += 2;
      notes.push('price above 200DMA');
    } else {
      score -= 2;
    }
  }
  if (sma20 !== null && sma50 !== null) {
    score += sma20 > sma50 ? 1 : -1;
  }
  if (sma50 !== null && sma200 !== null) {
    score += sma50 > sma200 ? 2 : -2;
  }

  for (const ret of [ret20, ret60, ret252]) {
    if (ret === null) {
      continue;
    }
    if (ret > 0) {
      score += 1;
    } else if (ret < 0) {
      score -= 1;
    }
  }

  if (lastClose >= high52 * 0.92) {
    score += 1;
    notes.push('trading near 52-week high');
  }
  if (lastClose <= low52 * 1.08) {
    score -= 1;
  }

  if (rsi14 !== null) {
    if (rsi14 >= 55 && rsi14 <= 68) {
      score += 1;
      notes.push('healthy RSI momentum');
    } else if (rsi14 >= 75 || rsi14 <= 25) {
      score -= 1;
    } else if (rsi14 < 45) {
      score -= 1;
    }
  }

  let signal = 'Strong Hold';
  if (score >= 6) {
    signal = 'Strong Buy';
  } else if (score <= -6) {
    signal = 'Strong Sell';
  } else if (Math.abs(score) <= 1) {
    signal = 'Skip';
  }

  return {
    signal,
    score,
    note: notes.length ? notes.slice(0, 3).join(', ') : 'Mixed technical structure',
    history_points: closes.length,
  };
}

function sectorName(symbol) {
  const bare = String(symbol || '')
    .replace('NSE:', '')
    .replace('BSE:', '')
    .replace('-EQ', '')
    .replace('-INDEX', '')
    .toUpperCase();

  if (bare.endsWith('INDEX') || bare.includes('INDEX')) {
    return 'Index';
  }
  return directSectorMap[bare] || 'Unknown';
}

function classifyDirectSignal(row) {
  const aiPick = Boolean(row.AI_Pick);
  const accumulation = Boolean(row.Accumulation);
  const volBreakout = Boolean(row.VolBreakout);
  const above200DMA = Boolean(row.Above200DMA);
  const dayChange = asNumber(row['DayChange_%']);
  const rsRating = asNumber(row.RS_rating_1_100);

  if (aiPick && accumulation && volBreakout && above200DMA) return 'STRONG BUY';
  if (aiPick && accumulation && above200DMA) return 'BUY';
  if (dayChange !== null && dayChange < 0 && rsRating !== null && rsRating < 40 && !accumulation && !above200DMA) return 'SELL';
  if (!aiPick && !accumulation && !volBreakout && dayChange !== null && dayChange < 0) return 'AVOID';
  return 'HOLD';
}

function directLiveRow(row) {
  const combinedAi = mean([asNumber(row.Intraday_AI_Prob), asNumber(row.AI_Prob)]);
  return {
    Ticker: row.Ticker,
    Sector: row.Sector || 'Unknown',
    Signal: row.Signal || 'HOLD',
    Price: row.CurrentPrice,
    'Change_%': row['DayChange_%'],
    'Gap_%': row['GapUp_%'],
    'DayRetFromOpen_%': row['DayRetFromOpen_%'],
    'VWAPDist_%': row['VWAPDist_%'],
    'IntradayRet_1Bar_%': row['IntradayRet_1Bar_%'],
    'IntradayRet_6Bar_%': row['IntradayRet_6Bar_%'],
    Intraday_AI_Prob: row.Intraday_AI_Prob,
    AI_Prob: row.AI_Prob,
    Combined_AI_Prob: safeRound(combinedAi, 4),
    IntradayMomentumScore: row.IntradayMomentumScore,
    RS_rating_1_100: row.RS_rating_1_100,
    Score: row.Score,
    Volume: row.Volume,
    IntradayTimestamp: row.IntradayTimestamp,
  };
}

function applyDirectQuoteRow(row, quote) {
  if (!row || !quote || typeof quote !== 'object') {
    return row;
  }

  const currentPrice = asNumber(quote.lp) ?? asNumber(row.CurrentPrice);
  const openPrice = asNumber(quote.open_price);
  const prevClose = asNumber(quote.prev_close_price);
  const volume = asNumber(quote.vol_traded_today) ?? asNumber(quote.volume);

  return {
    ...row,
    DayOpen: safeRound(openPrice ?? asNumber(row.DayOpen), 2),
    CurrentPrice: safeRound(currentPrice, 2),
    DayClosePrice: safeRound(currentPrice, 2),
    'DayChange_%': currentPrice !== null && prevClose !== null
      ? safeRound(percentChange(currentPrice, prevClose), 3)
      : row['DayChange_%'],
    Volume: volume ?? row.Volume,
  };
}

function directOverview(rows) {
  const counts = rows.reduce((acc, row) => {
    const signal = row.Signal || 'HOLD';
    acc[signal] = (acc[signal] || 0) + 1;
    return acc;
  }, {});

  const sectorCounts = {};
  for (const row of rows) {
    const sector = String(row.Sector || 'Unknown');
    sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
  }

  const bestSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    totalScanned: rows.length,
    strongBuy: counts['STRONG BUY'] || 0,
    buy: counts.BUY || 0,
    sell: counts.SELL || 0,
    avoid: counts.AVOID || 0,
    accumulation: rows.filter((row) => row.Accumulation).length,
    aiPicks: rows.filter((row) => row.AI_Pick).length,
    bestSector,
  };
}

function addDirectRsRating(rows) {
  const valid = rows
    .map((row) => asNumber(row['RS_3M_vs_NIFTY_%']))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  if (!valid.length) {
    return rows;
  }

  return rows.map((row) => {
    const value = asNumber(row['RS_3M_vs_NIFTY_%']);
    if (value === null) {
      return { ...row, RS_rating_1_100: null };
    }
    const position = valid.findIndex((item) => item >= value);
    const rating = Math.round((((position === -1 ? valid.length : position) + 1) / valid.length) * 99 + 1);
    return { ...row, RS_rating_1_100: rating };
  });
}

function parseTradeDate(row) {
  const candidates = [row.tradeDate, row.orderDateTime, row.date, row.createdOn, row.timestamp];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

export function createBackendService() {
  const settings = getSettings();
  const frontendUrl = readFrontendUrl();
  const tokenStore = new TokenStore(settings.tokenFile);
  const symbolMaster = new SymbolMaster(resolveProjectPath('.cache'));
  const quoteHub = new QuoteStreamHub(settings);
  const orderEventHub = new OrderEventHub(settings);
  const watchlistFile = path.resolve(process.env.WATCHLIST_FILE || '.data/watchlists.json');
  const analyticsCacheFile = path.resolve(process.env.NSE_ANALYTICS_CACHE_FILE || '.cache/nse_analytics_cache.json');
  const historyRowsCacheFile = path.resolve(process.env.NSE_HISTORY_ROWS_CACHE_FILE || '.cache/nse_history_rows_cache.json');
  const accountProfileDir = resolveProjectPath(ACCOUNT_PROFILE_DIRNAME);
  const accountProfileFile = path.join(accountProfileDir, ACCOUNT_PROFILE_FILENAME);
  const accountAvatarFile = path.join(accountProfileDir, ACCOUNT_AVATAR_FILENAME);
  const app = express();

  const historySignalCache = new Map();
  const historyRowsCache = new Map();
  let historySignalCacheLoaded = false;
  let historyRowsCacheLoaded = false;
  let historyRowsPersistTimer = null;

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '1mb' }));

  function resolveFrontendOrigin(req) {
    if (frontendUrl) {
      return frontendUrl;
    }
    const forwardedProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, '');
  }

  async function loadStoredAccountProfileRecord() {
    try {
      const raw = JSON.parse(await fs.readFile(accountProfileFile, 'utf8'));
      return {
        ...sanitizeAccountProfilePayload(raw),
        avatarUpdatedAt: String(raw?.avatarUpdatedAt || '').trim(),
        avatarFileName: String(raw?.avatarFileName || '').trim(),
        brokerAccount: String(raw?.brokerAccount || '').trim(),
      };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return {
          ...sanitizeAccountProfilePayload(),
          avatarUpdatedAt: '',
          avatarFileName: '',
          brokerAccount: '',
        };
      }
      throw error;
    }
  }

  function resolveAccountAvatarCandidates(profileRecord) {
    const explicitFileName = String(profileRecord?.avatarFileName || '').trim();
    const candidates = [];
    if (explicitFileName) {
      candidates.push(explicitFileName);
    }
    if (!candidates.includes(ACCOUNT_AVATAR_FILENAME)) {
      candidates.push(ACCOUNT_AVATAR_FILENAME);
    }
    return candidates;
  }

  async function readStoredAvatarMetadata(profileRecord) {
    for (const avatarFileName of resolveAccountAvatarCandidates(profileRecord)) {
      try {
        const filePath = path.join(accountProfileDir, avatarFileName);
        const stats = await fs.stat(filePath);
        return {
          updatedAt: stats.mtime.toISOString(),
          fileName: avatarFileName,
          filePath,
        };
      } catch (error) {
        if (!error || error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    try {
      const entries = await fs.readdir(accountProfileDir, { withFileTypes: true });
      const fallbackAvatarEntry = entries
        .filter((entry) => entry.isFile() && /\.(?:jpeg|jpg)$/i.test(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name))[0];
      if (!fallbackAvatarEntry) {
        return null;
      }
      const filePath = path.join(accountProfileDir, fallbackAvatarEntry.name);
      const stats = await fs.stat(filePath);
      return {
        updatedAt: stats.mtime.toISOString(),
        fileName: fallbackAvatarEntry.name,
        filePath,
      };
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }

    return null;
  }

  async function buildAccountProfileResponse(profileRecord) {
    const avatarMeta = await readStoredAvatarMetadata(profileRecord);
    const avatarUpdatedAt = String(profileRecord?.avatarUpdatedAt || avatarMeta?.updatedAt || '').trim();
    return {
      ...sanitizeAccountProfilePayload(profileRecord),
      avatarUpdatedAt: avatarUpdatedAt || null,
      avatarUrl: avatarMeta
        ? `${ACCOUNT_AVATAR_ROUTE}?ts=${encodeURIComponent(avatarUpdatedAt || avatarMeta.updatedAt)}`
        : '',
    };
  }

  async function saveAccountProfileRecord(profileRecord) {
    await fs.mkdir(accountProfileDir, { recursive: true });
    await fs.writeFile(accountProfileFile, JSON.stringify(profileRecord, null, 2), 'utf8');
  }

  async function loadApi() {
    const tokenPayload = await tokenStore.load();
    const accessToken = String(tokenPayload?.access_token || '').trim();
    if (!accessToken) {
      throw new Error('No access token found. Please login first.');
    }
    return new FyersApiService({ clientId: settings.clientId, accessToken });
  }

  async function loadWatchlists() {
    try {
      const raw = await fs.readFile(watchlistFile, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  async function saveWatchlists(data) {
    await fs.mkdir(path.dirname(watchlistFile), { recursive: true });
    await fs.writeFile(watchlistFile, JSON.stringify(data, null, 2), 'utf8');
  }

  async function ensureHistoryCacheLoaded() {
    if (historySignalCacheLoaded) {
      return;
    }
    historySignalCacheLoaded = true;
    try {
      const raw = JSON.parse(await fs.readFile(analyticsCacheFile, 'utf8'));
      const now = Date.now();
      for (const [symbol, item] of Object.entries(raw || {})) {
        const expiresAt = asNumber(item?.expires_at);
        if (!expiresAt || expiresAt <= now || typeof item?.payload !== 'object') {
          continue;
        }
        historySignalCache.set(normalizeSymbol(symbol), { expiresAt, payload: item.payload });
      }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        // Ignore cache bootstrap failures and rebuild lazily.
      }
    }
  }

  async function persistHistoryCache() {
    const now = Date.now();
    const snapshot = {};
    for (const [symbol, entry] of historySignalCache.entries()) {
      if (entry.expiresAt > now) {
        snapshot[symbol] = {
          expires_at: entry.expiresAt,
          payload: entry.payload,
        };
      }
    }
    await fs.mkdir(path.dirname(analyticsCacheFile), { recursive: true });
    await fs.writeFile(analyticsCacheFile, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  function historyRowsCacheKey(symbol, resolution, days) {
    return `${normalizeSymbol(symbol)}|${String(resolution || '').trim().toUpperCase()}|${Number(days) || 0}`;
  }

  function historyRowsTtlSeconds(resolution) {
    return String(resolution || '').trim().toUpperCase() === 'D'
      ? DAILY_HISTORY_CACHE_TTL_SECONDS
      : INTRADAY_HISTORY_CACHE_TTL_SECONDS;
  }

  function historyRowsStaleTtlSeconds(resolution) {
    return String(resolution || '').trim().toUpperCase() === 'D'
      ? DAILY_HISTORY_STALE_TTL_SECONDS
      : INTRADAY_HISTORY_STALE_TTL_SECONDS;
  }

  async function ensureHistoryRowsCacheLoaded() {
    if (historyRowsCacheLoaded) {
      return;
    }
    historyRowsCacheLoaded = true;
    try {
      const raw = JSON.parse(await fs.readFile(historyRowsCacheFile, 'utf8'));
      const now = Date.now();
      for (const [cacheKey, item] of Object.entries(raw || {})) {
        const rows = Array.isArray(item?.rows)
          ? item.rows.filter((row) => row && typeof row === 'object' && asNumber(row?.close) !== null)
          : [];
        const resolution = String(item?.resolution || cacheKey.split('|')[1] || '').trim().toUpperCase();
        const fetchedAt = asNumber(item?.fetched_at) || asNumber(item?.fetchedAt);
        const expiresAt = asNumber(item?.expires_at) || asNumber(item?.expiresAt) || (fetchedAt
          ? fetchedAt + (historyRowsTtlSeconds(resolution) * 1000)
          : null);
        if (!rows.length || !fetchedAt) {
          continue;
        }
        if (fetchedAt + (historyRowsStaleTtlSeconds(resolution) * 1000) <= now) {
          continue;
        }
        historyRowsCache.set(cacheKey, {
          fetchedAt,
          expiresAt,
          resolution,
          rows,
        });
      }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        // Ignore cache bootstrap failures and rebuild lazily.
      }
    }
  }

  async function persistHistoryRowsCache() {
    const now = Date.now();
    const snapshot = {};
    for (const [cacheKey, entry] of historyRowsCache.entries()) {
      const resolution = String(entry?.resolution || cacheKey.split('|')[1] || '').trim().toUpperCase();
      const fetchedAt = asNumber(entry?.fetchedAt);
      if (!Array.isArray(entry?.rows) || !entry.rows.length || !fetchedAt) {
        continue;
      }
      if (fetchedAt + (historyRowsStaleTtlSeconds(resolution) * 1000) <= now) {
        continue;
      }
      snapshot[cacheKey] = {
        fetched_at: fetchedAt,
        expires_at: asNumber(entry?.expiresAt) || (fetchedAt + (historyRowsTtlSeconds(resolution) * 1000)),
        resolution,
        rows: entry.rows,
      };
    }
    await fs.mkdir(path.dirname(historyRowsCacheFile), { recursive: true });
    await fs.writeFile(historyRowsCacheFile, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  function scheduleHistoryRowsCachePersist() {
    if (historyRowsPersistTimer) {
      return;
    }
    historyRowsPersistTimer = setTimeout(() => {
      historyRowsPersistTimer = null;
      void persistHistoryRowsCache();
    }, HISTORY_ROWS_CACHE_PERSIST_DEBOUNCE_MS);
    historyRowsPersistTimer.unref?.();
  }

  function getCachedHistorySignal(symbol) {
    const cacheKey = normalizeSymbol(symbol);
    const cached = historySignalCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      historySignalCache.delete(cacheKey);
      return null;
    }
    return cached.payload;
  }

  function setCachedHistorySignal(symbol, payload) {
    historySignalCache.set(normalizeSymbol(symbol), {
      expiresAt: Date.now() + (ANALYTICS_CACHE_TTL_SECONDS * 1000),
      payload,
    });
  }

  function getCachedHistoryRows(symbol, resolution, days) {
    const cacheKey = historyRowsCacheKey(symbol, resolution, days);
    const cached = historyRowsCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    if (asNumber(cached.expiresAt) <= Date.now()) {
      return null;
    }
    return cached.rows;
  }

  function getStaleHistoryRows(symbol, resolution, days) {
    const cacheKey = historyRowsCacheKey(symbol, resolution, days);
    const cached = historyRowsCache.get(cacheKey);
    if (!cached || !Array.isArray(cached.rows) || !cached.rows.length) {
      return null;
    }
    const fetchedAt = asNumber(cached.fetchedAt);
    if (!fetchedAt || fetchedAt + (historyRowsStaleTtlSeconds(resolution) * 1000) <= Date.now()) {
      historyRowsCache.delete(cacheKey);
      scheduleHistoryRowsCachePersist();
      return null;
    }
    return cached.rows;
  }

  function setCachedHistoryRows(symbol, resolution, days, rows) {
    const normalizedResolution = String(resolution || '').trim().toUpperCase();
    const now = Date.now();
    const cacheKey = historyRowsCacheKey(symbol, normalizedResolution, days);
    historyRowsCache.set(cacheKey, {
      expiresAt: now + (historyRowsTtlSeconds(normalizedResolution) * 1000),
      fetchedAt: now,
      resolution: normalizedResolution,
      rows,
    });
    scheduleHistoryRowsCachePersist();
  }

  async function dailyHistoryForSignal(api, symbol) {
    const endDate = currentDateUtc();
    const startDate = addDays(endDate, -(ANALYTICS_HISTORY_YEARS * 365));
    const allCandles = [];
    let chunkEnd = endDate;

    while (chunkEnd >= startDate) {
      const candidateStart = addDays(chunkEnd, -ANALYTICS_CHUNK_DAYS);
      const chunkStart = candidateStart > startDate ? candidateStart : startDate;
      const data = await api.history(symbol, 'D', chunkStart, chunkEnd);
      allCandles.push(...(data?.candles || []));
      chunkEnd = addDays(chunkStart, -1);
    }

    const deduped = new Map();
    for (const candle of allCandles) {
      if (Array.isArray(candle) && candle.length >= 5) {
        deduped.set(Number(candle[0]), candle);
      }
    }
    return Array.from(deduped.entries()).sort((a, b) => a[0] - b[0]).map(([, candle]) => candle);
  }

  async function historyAnalyticsForSymbol(api, symbol) {
    const cached = getCachedHistorySignal(symbol);
    if (cached) {
      return { payload: cached, updated: false };
    }

    const candles = await dailyHistoryForSignal(api, symbol);
    const payload = {
      yesterday: previousSession(candles),
      ...signalFromCandles(candles),
      history_window_years: ANALYTICS_HISTORY_YEARS,
    };

    setCachedHistorySignal(symbol, payload);
    return { payload, updated: true };
  }

  async function historyRows(api, symbol, resolution, days) {
    await ensureHistoryRowsCacheLoaded();
    const cachedRows = getCachedHistoryRows(symbol, resolution, days);
    if (cachedRows) {
      return cachedRows;
    }
    const staleRows = getStaleHistoryRows(symbol, resolution, days);

    const endDate = currentDateUtc();
    const startDate = addDays(endDate, -Math.max(days, 1));
    const allCandles = [];

    try {
      if (resolution === 'D' && days > HISTORY_CHUNK_DAYS) {
        let chunkEnd = endDate;
        while (chunkEnd > startDate) {
          const chunkStart = addDays(chunkEnd, -HISTORY_CHUNK_DAYS) > startDate ? addDays(chunkEnd, -HISTORY_CHUNK_DAYS) : startDate;
          const data = await api.history(symbol, resolution, chunkStart, chunkEnd);
          allCandles.push(...(data?.candles || []));
          chunkEnd = addDays(chunkStart, -1);
        }
      } else {
        const data = await api.history(symbol, resolution, startDate, endDate);
        allCandles.push(...(data?.candles || []));
      }
    } catch (error) {
      if (staleRows?.length) {
        return staleRows;
      }
      throw error;
    }

    const deduped = new Map();
    for (const candle of allCandles) {
      if (Array.isArray(candle) && candle.length >= 6) {
        deduped.set(Number(candle[0]), candle);
      }
    }

    const rows = Array.from(deduped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, candle]) => ({
        symbol: normalizeSymbol(symbol),
        open: asNumber(candle[1]),
        high: asNumber(candle[2]),
        low: asNumber(candle[3]),
        close: asNumber(candle[4]),
        volume: asNumber(candle[5]),
        date: isoDateFromUnixSeconds(key),
      }))
      .filter((row) => row.close !== null);

    if (!rows.length && staleRows?.length) {
      return staleRows;
    }

    setCachedHistoryRows(symbol, resolution, days, rows);
    return rows;
  }

  function calculateAtr(rows, period = DIRECT_ATR_PERIOD) {
    if (rows.length < period + 1) {
      return null;
    }
    const trueRanges = [];
    for (let index = rows.length - period; index < rows.length; index += 1) {
      const row = rows[index];
      const prevClose = asNumber(rows[index - 1]?.close);
      const high = asNumber(row?.high);
      const low = asNumber(row?.low);
      if (high === null || low === null || prevClose === null) {
        continue;
      }
      trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    return mean(trueRanges);
  }

  function calculateCmf(rows, period = DIRECT_CMF_PERIOD) {
    if (rows.length < period) {
      return null;
    }
    let moneyFlowVolume = 0;
    let volumeTotal = 0;
    for (const row of rows.slice(-period)) {
      const high = asNumber(row.high);
      const low = asNumber(row.low);
      const close = asNumber(row.close);
      const volume = asNumber(row.volume);
      if ([high, low, close, volume].some((value) => value === null)) {
        continue;
      }
      const spread = high - low;
      if (spread === 0) {
        continue;
      }
      const multiplier = ((close - low) - (high - close)) / spread;
      moneyFlowVolume += multiplier * volume;
      volumeTotal += volume;
    }
    if (!volumeTotal) {
      return null;
    }
    return moneyFlowVolume / volumeTotal;
  }

  function calculateObvSlope(rows, period = DIRECT_OBV_SLOPE_DAYS) {
    if (rows.length < period + 1) {
      return null;
    }
    let obv = 0;
    const values = [];
    for (let index = rows.length - period; index < rows.length; index += 1) {
      const prevClose = asNumber(rows[index - 1]?.close);
      const currentClose = asNumber(rows[index]?.close);
      const volume = asNumber(rows[index]?.volume) || 0;
      if (prevClose === null || currentClose === null) {
        continue;
      }
      if (currentClose > prevClose) obv += volume;
      else if (currentClose < prevClose) obv -= volume;
      values.push(obv);
    }
    return linearSlope(values);
  }

  function computeSupportResistance(rows, lookbackDays = DIRECT_SR_LOOKBACK_DAYS) {
    const sliceRows = rows.slice(-lookbackDays);
    if (!sliceRows.length) {
      return [null, null];
    }
    const lows = sliceRows.map((row) => asNumber(row.low)).filter((value) => value !== null);
    const highs = sliceRows.map((row) => asNumber(row.high)).filter((value) => value !== null);
    return [
      lows.length ? safeRound(Math.min(...lows), 2) : null,
      highs.length ? safeRound(Math.max(...highs), 2) : null,
    ];
  }

  function intradaySignal(rows) {
    if (!rows.length) {
      return {
        prob: null,
        momentum: null,
        ret1: null,
        ret6: null,
        dayRet: null,
        vwapDist: null,
        timestamp: null,
      };
    }

    const closes = rows.map((row) => asNumber(row.close)).filter((value) => value !== null);
    const volumes = rows.map((row) => asNumber(row.volume)).filter((value) => value !== null);
    const latest = rows[rows.length - 1];
    const ret1 = closes.length > 1 ? percentChange(closes[closes.length - 1], closes[closes.length - 2]) : null;
    const ret6 = closes.length > 6 ? percentChange(closes[closes.length - 1], closes[closes.length - 7]) : null;
    const recentVolumeAvg = volumes.length >= 5 ? mean(volumes.slice(-5)) : null;
    const latestVolume = asNumber(latest.volume);
    const volRatio5 = recentVolumeAvg && latestVolume !== null ? latestVolume / recentVolumeAvg : null;
    const rsi14 = computeRsi(closes, 14);
    const slope = closes.length >= 12 ? linearSlope(closes.slice(-12)) : null;
    const sessionOpen = asNumber(rows[0]?.open);
    const dayRet = closes.length && sessionOpen ? percentChange(closes[closes.length - 1], sessionOpen) : null;

    let cumulativeTpv = 0;
    let cumulativeVolume = 0;
    for (const row of rows) {
      const high = asNumber(row.high);
      const low = asNumber(row.low);
      const close = asNumber(row.close);
      const volume = asNumber(row.volume);
      if ([high, low, close, volume].some((value) => value === null)) {
        continue;
      }
      cumulativeTpv += ((high + low + close) / 3) * volume;
      cumulativeVolume += volume;
    }
    const vwap = cumulativeVolume ? cumulativeTpv / cumulativeVolume : null;
    const vwapDist = vwap !== null && closes.length ? percentChange(closes[closes.length - 1], vwap + 0.000001) : null;

    const probability = mean([
      minMaxNormalize(ret1 || 0, -1.5, 1.5),
      minMaxNormalize(ret6 || 0, -3, 3),
      minMaxNormalize(dayRet || 0, -3, 3),
      minMaxNormalize(vwapDist || 0, -2, 2),
      minMaxNormalize((volRatio5 || 1) - 1, 0, 2),
      minMaxNormalize((rsi14 || 50) - 50, -20, 20),
      minMaxNormalize(slope || 0, -2, 2),
    ]);
    const momentum = mean([
      probability !== null ? probability * 100 : null,
      minMaxNormalize(dayRet || 0, -3, 3) * 100,
      minMaxNormalize(vwapDist || 0, -2, 2) * 100,
    ]);

    return {
      prob: safeRound(probability, 4),
      momentum: safeRound(momentum, 2),
      ret1: safeRound(ret1, 3),
      ret6: safeRound(ret6, 3),
      dayRet: safeRound(dayRet, 3),
      vwapDist: safeRound(vwapDist, 3),
      timestamp: latest.date,
    };
  }

  async function buildDirectRow(api, symbol, benchmarkRows, options = {}) {
    const includeIntraday = options.includeIntraday !== false;
    const dailyRows = await historyRows(api, symbol, 'D', DIRECT_DAILY_HISTORY_DAYS);
    if (dailyRows.length < 80) {
      return null;
    }
    let intradayRows = [];
    if (includeIntraday) {
      try {
        intradayRows = await historyRows(api, symbol, DIRECT_INTRADAY_RESOLUTION, DIRECT_INTRADAY_HISTORY_DAYS);
      } catch {
        intradayRows = [];
      }
    }
    const intraday = intradaySignal(intradayRows);

    const closes = dailyRows.map((row) => asNumber(row.close)).filter((value) => value !== null);
    const volumes = dailyRows.map((row) => asNumber(row.volume)).filter((value) => value !== null);
    const latest = dailyRows[dailyRows.length - 1];
    const previous = dailyRows[dailyRows.length - 2] || null;
    const currentPrice = asNumber(latest.close);
    const dayOpen = asNumber(latest.open);
    const prevClose = previous ? asNumber(previous.close) : null;
    const dayChangePct = percentChange(currentPrice, prevClose);
    const windowRows = dailyRows.slice(-DIRECT_LOOKBACK_52W);
    const high52 = Math.max(...windowRows.map((row) => asNumber(row.high)).filter((value) => value !== null));
    const low52 = Math.min(...windowRows.map((row) => asNumber(row.low)).filter((value) => value !== null));
    const distHigh = currentPrice !== null && high52 ? ((high52 - currentPrice) / high52) * 100 : null;
    const distLow = currentPrice !== null && low52 ? ((currentPrice - low52) / low52) * 100 : null;
    const nearHigh = distHigh !== null && distHigh <= DIRECT_NEAR_PCT_52W;
    const nearLow = distLow !== null && distLow <= DIRECT_NEAR_PCT_52W;
    const avg20 = mean(volumes.slice(-20));
    const latestVolume = asNumber(latest.volume);
    const volRatio = avg20 && latestVolume !== null ? latestVolume / avg20 : null;
    const volSpike = volRatio !== null && volRatio >= DIRECT_VOL_SPIKE_MULT;
    const volBreakout = volRatio !== null && volRatio >= DIRECT_VOL_BREAKOUT_MULT;
    const ma50 = rollingMean(closes, DIRECT_MA50);
    const ma200 = rollingMean(closes, DIRECT_MA200);
    const above200DMA = currentPrice !== null && ma200 !== null ? currentPrice > ma200 : null;
    const high20 = Math.max(...dailyRows.slice(-20).map((row) => asNumber(row.high)).filter((value) => value !== null));
    const breakout20D = currentPrice !== null ? currentPrice >= high20 : false;
    const gapUpPct = percentChange(dayOpen, prevClose);
    const gapUp = gapUpPct !== null && gapUpPct >= DIRECT_GAP_UP_PCT;
    const sma5 = rollingMean(closes, 5);
    const reversalLow = Boolean(nearLow && sma5 !== null && currentPrice !== null && currentPrice > sma5);
    const atr = calculateAtr(dailyRows, DIRECT_ATR_PERIOD);
    const stopLoss = currentPrice !== null && atr !== null ? currentPrice - (DIRECT_ATR_STOP_MULT * atr) : null;
    const riskPerShare = currentPrice !== null && stopLoss !== null ? currentPrice - stopLoss : null;
    const qty = riskPerShare && riskPerShare > 0 ? Math.floor(DIRECT_RISK_PER_TRADE_INR / riskPerShare) : null;
    const [support, resistance] = computeSupportResistance(dailyRows, DIRECT_SR_LOOKBACK_DAYS);
    const cmf20 = calculateCmf(dailyRows, DIRECT_CMF_PERIOD);
    const obvSlope = calculateObvSlope(dailyRows, DIRECT_OBV_SLOPE_DAYS);
    const rsi14 = computeRsi(closes, 14);
    const accumScore = mean([
      (minMaxNormalize(cmf20 || 0, -0.2, 0.2) || 0) * 100,
      (minMaxNormalize(obvSlope || 0, -1000000, 1000000) || 0) * 100,
      (minMaxNormalize(volRatio || 0, 0.5, 2.5) || 0) * 100,
      (minMaxNormalize(rsi14 || 50, 40, 80) || 0) * 100,
    ]);
    const accumulation = Boolean(accumScore !== null && accumScore >= DIRECT_ACCUM_SCORE_MIN && above200DMA);

    let rs3 = null;
    let rs6 = null;
    if (benchmarkRows.length > 63 && closes.length > 63) {
      rs3 = percentChange(currentPrice, closes[closes.length - 64]);
      const benchmarkRs3 = percentChange(asNumber(benchmarkRows[benchmarkRows.length - 1]?.close), asNumber(benchmarkRows[benchmarkRows.length - 64]?.close));
      if (rs3 !== null && benchmarkRs3 !== null) rs3 -= benchmarkRs3;
    }
    if (benchmarkRows.length > 126 && closes.length > 126) {
      rs6 = percentChange(currentPrice, closes[closes.length - 127]);
      const benchmarkRs6 = percentChange(asNumber(benchmarkRows[benchmarkRows.length - 1]?.close), asNumber(benchmarkRows[benchmarkRows.length - 127]?.close));
      if (rs6 !== null && benchmarkRs6 !== null) rs6 -= benchmarkRs6;
    }

    const aiProb = mean([
      intraday.prob,
      minMaxNormalize(volRatio || 0, 0.5, 2.5),
      minMaxNormalize(rsi14 || 50, 40, 80),
      minMaxNormalize(rs3 || 0, -10, 10),
      minMaxNormalize(rs6 || 0, -15, 15),
      minMaxNormalize(dayChangePct || 0, -5, 5),
    ]);
    const aiPick = aiProb !== null && aiProb >= DIRECT_AI_PROB_MIN;

    let score = 0;
    if (nearHigh) score += 35;
    if (breakout20D) score += 20;
    if (volSpike) score += 15;
    if (above200DMA) score += 10;
    if (volBreakout) score += 10;
    if (gapUp) score += 5;
    if (accumulation) score += 5;
    if ((intraday.momentum || 0) > 60) score += 10;

    const row = {
      Ticker: normalizeSymbol(symbol),
      LastDate: String(latest.date || '').slice(0, 10) || null,
      DayOpen: safeRound(dayOpen, 2),
      CurrentPrice: safeRound(currentPrice, 2),
      DayClosePrice: safeRound(currentPrice, 2),
      'DayChange_%': safeRound(dayChangePct, 3),
      Sector: sectorName(symbol),
      DeliveryPct: null,
      '52W_High': safeRound(high52, 2),
      '52W_Low': safeRound(low52, 2),
      'DistFrom52WHigh_%': safeRound(distHigh, 4),
      'DistFrom52WLow_%': safeRound(distLow, 4),
      Volume: latestVolume,
      AvgVol20: safeRound(avg20, 0),
      VolRatio: safeRound(volRatio, 3),
      VolSpike: Boolean(volSpike),
      VolBreakout: Boolean(volBreakout),
      MA50: safeRound(ma50, 2),
      MA200: safeRound(ma200, 2),
      Above200DMA: above200DMA,
      GapUp: Boolean(gapUp),
      'GapUp_%': safeRound(gapUpPct, 3),
      Near52WHigh: Boolean(nearHigh),
      Near52WLow: Boolean(nearLow),
      Breakout20D: Boolean(breakout20D),
      ReversalFromLow: Boolean(reversalLow),
      Support: support,
      Resistance: resistance,
      'RS_3M_vs_NIFTY_%': safeRound(rs3, 3),
      'RS_6M_vs_NIFTY_%': safeRound(rs6, 3),
      CMF20: safeRound(cmf20, 4),
      OBV_Slope20: safeRound(obvSlope, 2),
      RSI14: safeRound(rsi14, 2),
      AccumScore: safeRound(accumScore, 1),
      Accumulation: Boolean(accumulation),
      ATR14: safeRound(atr, 3),
      StopLoss_ATR: safeRound(stopLoss, 2),
      RiskPerShare: safeRound(riskPerShare, 2),
      'Qty_for_Risk(INR)': qty,
      AI_Prob: safeRound(aiProb, 4),
      AI_Pick: Boolean(aiPick),
      Intraday_AI_Prob: intraday.prob,
      IntradayMomentumScore: intraday.momentum,
      'IntradayRet_1Bar_%': intraday.ret1,
      'IntradayRet_6Bar_%': intraday.ret6,
      'DayRetFromOpen_%': intraday.dayRet,
      'VWAPDist_%': intraday.vwapDist,
      IntradayTimestamp: intraday.timestamp,
      Score: score,
      RS_rating_1_100: null,
    };
    row.Signal = classifyDirectSignal(row);
    return row;
  }

  async function loadPredefinedRules() {
    const defaults = [
      { id: 'indices', name: 'Indices', symbols: ['NSE:NIFTY50-INDEX', 'NSE:NIFTYBANK-INDEX', 'NSE:FINNIFTY-INDEX', 'NSE:MIDCPNIFTY-INDEX', 'NSE:BANKEX-INDEX'] },
      { id: 'banking', name: 'Banking', queries: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK', 'INDUSINDBK'], limit: 8 },
      { id: 'it', name: 'IT Leaders', queries: ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM', 'LTIM'], limit: 8 },
    ];

    const rulesPath = path.resolve(process.env.PREDEFINED_WATCHLIST_RULES_FILE || '.data/predefined_watchlists.json');
    const rulesJson = String(process.env.PREDEFINED_WATCHLIST_RULES_JSON || '').trim();
    if (rulesJson) {
      try {
        const parsed = JSON.parse(rulesJson);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed;
        }
      } catch {
        // Fall back to defaults.
      }
    }

    try {
      const parsed = JSON.parse(await fs.readFile(rulesPath, 'utf8'));
      if (Array.isArray(parsed) && parsed.length) {
        return parsed;
      }
    } catch {
      // Fall back to defaults.
    }

    return defaults;
  }

  async function buildPredefinedLists() {
    const rules = await loadPredefinedRules();
    const predefined = [];

    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      if (!rule || typeof rule !== 'object') {
        continue;
      }

      const listId = String(rule.id || `rule-${index + 1}`).trim().toLowerCase().replace(/\s+/g, '-');
      const listName = String(rule.name || listId).trim() || listId;
      const limit = Number.parseInt(String(rule.limit || 30), 10) || 30;
      const seen = new Set();
      const symbols = [];

      if (Array.isArray(rule.symbols)) {
        for (const rawSymbol of rule.symbols) {
          const symbol = normalizeSymbol(rawSymbol);
          if (symbol && !seen.has(symbol)) {
            seen.add(symbol);
            symbols.push(symbol);
            if (symbols.length >= limit) break;
          }
        }
      }

      if (symbols.length < limit && Array.isArray(rule.queries)) {
        for (const query of rule.queries) {
          if (!query) continue;
          const candidates = await symbolMaster.search(String(query), Math.max(limit, 30));
          for (const item of candidates) {
            const symbol = normalizeSymbol(item.symbol);
            if (symbol && !seen.has(symbol)) {
              seen.add(symbol);
              symbols.push(symbol);
              if (symbols.length >= limit) break;
            }
          }
          if (symbols.length >= limit) break;
        }
      }

      if (symbols.length) {
        predefined.push({ id: listId, name: listName, symbols });
      }
    }

    return predefined;
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', runtime: 'node' });
  });

  app.post('/api/login', async (req, res) => {
    const brokerPin = String(req.body?.pin || '').trim() || null;
    if (!brokerPin) {
      return res.status(400).json({ status: 'error', message: 'Enter your 4-digit broker account PIN to continue.' });
    }
    if (!/^\d{4}$/.test(brokerPin)) {
      return res.status(400).json({ status: 'error', message: 'Broker PIN must be exactly 4 digits.' });
    }

    const authService = new FyersAuthService(settings);
    try {
      const result = await authService.loginWithTotp(brokerPin);
      await tokenStore.save(result);
      return res.json({ status: 'ok', mode: 'totp' });
    } catch (error) {
      if (error instanceof PinVerificationError) {
        return res.status(401).json({ status: 'error', message: error.message });
      }
      if (error instanceof MissingBrokerPinError) {
        return res.status(400).json({ status: 'error', message: error.message });
      }
      return res.status(202).json({
        status: 'redirect_required',
        message: error.message,
        auth_url: authService.getManualAuthUrl(),
      });
    }
  });

  app.get('/api/auth-url', (_req, res) => {
    const authService = new FyersAuthService(settings);
    res.json({ auth_url: authService.getManualAuthUrl() });
  });

  app.get('/api/profile', async (_req, res) => {
    try {
      const storedProfile = await loadStoredAccountProfileRecord();
      return res.json({
        status: 'ok',
        profile: await buildAccountProfileResponse(storedProfile),
      });
    } catch {
      return res.status(500).json({ status: 'error', message: 'Unable to load the saved account profile.' });
    }
  });

  app.put('/api/profile', async (req, res) => {
    try {
      const currentProfile = await loadStoredAccountProfileRecord();
      const brokerAccount = String(
        req.body?.brokerAccount
        || req.body?.broker_account
        || currentProfile.brokerAccount
        || ''
      ).trim();
      const nextProfile = {
        ...sanitizeAccountProfilePayload(req.body),
        avatarUpdatedAt: currentProfile.avatarUpdatedAt || '',
        avatarFileName: currentProfile.avatarFileName || '',
        brokerAccount,
      };
      const avatarDataUrl = String(req.body?.avatarDataUrl || '').trim();
      if (avatarDataUrl) {
        const avatarBuffer = decodeJpegDataUrl(avatarDataUrl);
        const avatarFileName = buildAccountAvatarFilename(brokerAccount);
        await fs.mkdir(accountProfileDir, { recursive: true });
        await fs.writeFile(path.join(accountProfileDir, avatarFileName), avatarBuffer);
        if (currentProfile.avatarFileName && currentProfile.avatarFileName !== avatarFileName) {
          try {
            await fs.unlink(path.join(accountProfileDir, currentProfile.avatarFileName));
          } catch (error) {
            if (!error || error.code !== 'ENOENT') {
              throw error;
            }
          }
        }
        nextProfile.avatarUpdatedAt = new Date().toISOString();
        nextProfile.avatarFileName = avatarFileName;
      }

      await saveAccountProfileRecord(nextProfile);
      return res.json({
        status: 'ok',
        profile: await buildAccountProfileResponse(nextProfile),
      });
    } catch (error) {
      const message = error?.message || 'Unable to save the account profile.';
      const statusCode = /Profile picture/i.test(message) ? 400 : 500;
      return res.status(statusCode).json({ status: 'error', message });
    }
  });

  app.get(ACCOUNT_AVATAR_ROUTE, async (_req, res) => {
    try {
      const profileRecord = await loadStoredAccountProfileRecord();
      const avatarMeta = await readStoredAvatarMetadata(profileRecord);
      if (!avatarMeta) {
        return res.status(404).json({ status: 'error', message: 'Profile picture not found.' });
      }
      res.type('jpeg');
      return res.sendFile(avatarMeta.filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return res.status(404).json({ status: 'error', message: 'Profile picture not found.' });
      }
      return res.status(500).json({ status: 'error', message: 'Unable to load the profile picture.' });
    }
  });

  app.get('/api/auth/callback', async (req, res) => {
    const authCode = String(req.query.auth_code || '').trim();
    if (!authCode) {
      return res.status(400).json({ status: 'error', message: 'auth_code missing' });
    }

    const authService = new FyersAuthService(settings);
    const target = resolveFrontendOrigin(req);
    try {
      const result = await authService.exchangeAuthCode(authCode);
      await tokenStore.save(result);
      return res.redirect(`${target}/?login=success`);
    } catch (error) {
      return res.redirect(`${target}/?login=error&reason=${encodeURIComponent(error.message)}`);
    }
  });

  app.get('/api/session', async (_req, res) => {
    try {
      const api = await loadApi();
      const profile = await api.profile();
      if (String(profile?.s || '').toLowerCase() === 'ok') {
        return res.json({ authenticated: true, profile: profile?.data || {} });
      }
      const funds = await api.funds();
      if (String(funds?.s || '').toLowerCase() === 'ok') {
        return res.json({
          authenticated: true,
          profile: {},
          warning: profile?.message || 'Profile details are temporarily unavailable.',
        });
      }
      return res.json({ authenticated: false, message: profile?.message || 'Unable to validate FYERS session.' });
    } catch (error) {
      return res.json({ authenticated: false, message: error.message });
    }
  });

  app.post('/api/logout', async (_req, res) => {
    await tokenStore.delete();
    res.json({ status: 'ok', authenticated: false });
  });

  app.get('/api/dashboard', async (_req, res) => {
    try {
      const api = await loadApi();
      res.json(await buildDashboardPayload(api));
    } catch (error) {
      res.status(401).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/pnl-history', async (req, res) => {
    try {
      const days = Number.parseInt(String(req.query.days || 180), 10) || 180;
      const api = await loadApi();
      const tradebook = await api.tradebook();
      const cutoff = addDays(currentDateUtc(), -days);
      const rows = (tradebook?.tradeBook || tradebook?.tradebook || []).filter((row) => {
        const tradeDate = parseTradeDate(row);
        return !tradeDate || tradeDate >= cutoff;
      });
      res.json({ rows });
    } catch (error) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/orders', async (req, res) => {
    try {
      const symbol = String(req.body?.symbol || '').trim();
      const qty = Number.parseInt(String(req.body?.qty || 0), 10);
      const side = String(req.body?.side || 'BUY').trim().toUpperCase();
      const orderType = String(req.body?.orderType || 'MARKET').trim().toUpperCase();
      const productType = String(req.body?.productType || 'INTRADAY').trim();
      const limitPrice = Number(req.body?.limitPrice || 0);
      const stopPrice = Number(req.body?.stopPrice || 0);
      const validity = String(req.body?.validity || 'DAY').trim();
      const disclosedQty = Number.parseInt(String(req.body?.disclosedQty || 0), 10) || 0;
      const offlineOrder = Boolean(req.body?.offlineOrder);
      const stopLoss = Number(req.body?.stopLoss || 0);
      const takeProfit = Number(req.body?.takeProfit || 0);
      const forceLive = Boolean(req.body?.forceLive);

      if (!symbol || qty < 1) {
        return res.status(400).json({ status: 'error', message: 'symbol and qty are required.' });
      }
      if (orderType === 'LIMIT' && limitPrice <= 0) {
        return res.status(400).json({ status: 'error', message: 'limitPrice must be > 0 for LIMIT orders.' });
      }

      const api = await loadApi();
      const orderPayload = {
        symbol,
        qty,
        type: mapOrderType(orderType),
        side: mapSide(side),
        productType,
        limitPrice,
        stopPrice,
        validity,
        disclosedQty,
        offlineOrder,
        stopLoss,
        takeProfit,
      };

      if (settings.paperTradeMode && !forceLive) {
        return res.json({ status: 'ok', paper_trade: true, validated_public_ip: null, simulated_order: orderPayload });
      }

      const validatedIp = await ensureStaticIp(settings);
      const orderResponse = await api.placeOrder(orderPayload);
      return res.json({ status: 'ok', paper_trade: false, validated_public_ip: validatedIp, order_response: orderResponse });
    } catch (error) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/strategy/run', async (req, res) => {
    try {
      const symbol = String(req.body?.symbol || '').trim();
      const qty = Number.parseInt(String(req.body?.qty || 0), 10);
      const side = String(req.body?.side || 'BUY').trim().toUpperCase();
      const triggerLtp = Number(req.body?.triggerLtp || 0);
      const productType = String(req.body?.productType || 'INTRADAY').trim();
      const validity = String(req.body?.validity || 'DAY').trim();
      const forceLive = Boolean(req.body?.forceLive);

      if (!symbol || qty < 1 || triggerLtp <= 0) {
        return res.status(400).json({ status: 'error', message: 'symbol, qty, and triggerLtp are required.' });
      }

      const api = await loadApi();
      const quotesResponse = await api.quotes([symbol]);
      const data = quotesResponse?.d || [];
      if (!data.length) {
        return res.status(400).json({ status: 'error', message: `No quote data returned for ${symbol}.` });
      }

      const quote = data[0]?.v || {};
      const ltpValue = Number(quote.lp);
      if (!Number.isFinite(ltpValue)) {
        return res.status(400).json({ status: 'error', message: 'LTP missing in quote response.' });
      }

      if (!checkTrigger(side, ltpValue, triggerLtp)) {
        return res.json({
          status: 'ok',
          triggered: false,
          validated_public_ip: null,
          current_ltp: ltpValue,
          trigger_ltp: triggerLtp,
          message: 'Trigger condition not met. No order sent.',
        });
      }

      const orderPayload = {
        symbol,
        qty,
        type: mapOrderType('MARKET'),
        side: mapSide(side),
        productType,
        limitPrice: 0,
        stopPrice: 0,
        validity,
        disclosedQty: 0,
        offlineOrder: false,
        stopLoss: 0,
        takeProfit: 0,
      };

      if (settings.paperTradeMode && !forceLive) {
        return res.json({ status: 'ok', triggered: true, paper_trade: true, validated_public_ip: null, current_ltp: ltpValue, simulated_order: orderPayload });
      }

      const validatedIp = await ensureStaticIp(settings);
      const orderResponse = await api.placeOrder(orderPayload);
      return res.json({ status: 'ok', triggered: true, paper_trade: false, validated_public_ip: validatedIp, current_ltp: ltpValue, order_response: orderResponse });
    } catch (error) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/symbols/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const limit = Math.min(Number.parseInt(String(req.query.limit || 30), 10) || 30, 100);
    if (!query) {
      return res.json({ results: [] });
    }
    try {
      res.json({ results: await symbolMaster.search(query, limit) });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/symbols/all', async (_req, res) => {
    try {
      res.json({ results: await symbolMaster.allSymbols() });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/quotes', async (req, res) => {
    const raw = String(req.query.symbols || '').trim();
    if (!raw) {
      return res.json({ d: [] });
    }
    try {
      const api = await loadApi();
      const symbols = raw.split(',').map((symbol) => symbol.trim()).filter(Boolean);
      res.json(await api.quotes(symbols));
    } catch (error) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/history', async (req, res) => {
    const symbol = String(req.query.symbol || '').trim();
    let resolution = String(req.query.resolution || '5').trim().toUpperCase();
    const days = Number.parseInt(String(req.query.days || 5), 10) || 5;
    if (!symbol) {
      return res.status(400).json({ status: 'error', message: 'symbol is required' });
    }

    try {
      const api = await loadApi();
      if (resolution !== 'D' && days > MAX_INTRADAY_DAYS) {
        resolution = 'D';
      }

      const rows = await historyRows(api, symbol, resolution, days);
      const candles = rows
        .map((row) => {
          const unixSeconds = Math.floor(new Date(row.date).getTime() / 1000);
          if (!Number.isFinite(unixSeconds)) {
            return null;
          }
          return [
            unixSeconds,
            asNumber(row.open),
            asNumber(row.high),
            asNumber(row.low),
            asNumber(row.close),
            asNumber(row.volume) ?? 0,
          ];
        })
        .filter((candle) => Array.isArray(candle) && candle.slice(1, 5).every((value) => value !== null));

      return res.json({ s: 'ok', candles });
    } catch (error) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/symbols/analytics', async (req, res) => {
    const rawSymbols = Array.isArray(req.body?.symbols) ? req.body.symbols : null;
    if (!rawSymbols) {
      return res.status(400).json({ status: 'error', message: 'symbols must be an array' });
    }

    const seen = new Set();
    const symbols = rawSymbols
      .map((symbol) => normalizeSymbol(symbol))
      .filter((symbol) => symbol && !seen.has(symbol) && seen.add(symbol))
      .slice(0, MAX_ANALYTICS_SYMBOLS);

    if (!symbols.length) {
      return res.json({ results: {} });
    }

    try {
      await ensureHistoryCacheLoaded();
      const api = await loadApi();
      let quotes = {};
      try {
        quotes = quoteMap(await api.quotes(symbols));
      } catch {
        quotes = {};
      }
      let cacheUpdated = false;
      const historyData = {};

      await mapWithConcurrency(symbols, Math.min(ANALYTICS_CONCURRENCY, symbols.length), async (symbol) => {
        try {
          const result = await historyAnalyticsForSymbol(api, symbol);
          historyData[symbol] = result.payload;
          cacheUpdated = cacheUpdated || result.updated;
        } catch (error) {
          historyData[symbol] = {
            signal: 'Skip',
            score: 0,
            note: `Analytics unavailable: ${error.message}`,
            history_points: 0,
            history_window_years: ANALYTICS_HISTORY_YEARS,
            yesterday: { date: null, open: null, close: null },
          };
        }
      });

      if (cacheUpdated) {
        await persistHistoryCache();
      }

      const results = {};
      for (const symbol of symbols) {
        const quote = quotes[symbol] || {};
        const history = historyData[symbol] || {};
        results[symbol] = {
          today: {
            open: asNumber(quote.open_price),
            high: asNumber(quote.high_price),
            low: asNumber(quote.low_price),
            ltp: asNumber(quote.lp),
          },
          yesterday: history.yesterday || { date: null, open: null, close: null },
          signal: history.signal || 'Skip',
          signalScore: history.score || 0,
          signalNote: history.note || 'Mixed technical structure',
          historyPoints: history.history_points || 0,
          historyWindowYears: history.history_window_years || ANALYTICS_HISTORY_YEARS,
        };
      }

      res.json({ results });
    } catch (error) {
      res.status(400).json({ status: 'error', message: `Unable to load quote snapshot: ${error.message}` });
    }
  });

  app.post('/api/screener/direct', async (req, res) => {
    const rawSymbols = Array.isArray(req.body?.symbols) ? req.body.symbols : null;
    if (!rawSymbols) {
      return res.status(400).json({ status: 'error', message: 'symbols must be an array' });
    }

    const limit = Math.min(Number.parseInt(String(req.body?.limit || MAX_DIRECT_SCREENER_SYMBOLS), 10) || MAX_DIRECT_SCREENER_SYMBOLS, MAX_DIRECT_SCREENER_SYMBOLS);
    const seen = new Set();
    const symbols = rawSymbols
      .map((symbol) => normalizeSymbol(symbol))
      .filter((symbol) => symbol && !seen.has(symbol) && seen.add(symbol))
      .slice(0, limit);

    if (!symbols.length) {
      return res.json({ status: 'ok', source: 'fyers-direct', overview: directOverview([]), datasets: { allRanked: [], liveMarket: [], errors: [] } });
    }

    try {
      const api = await loadApi();
      const includeIntradayHistory = symbols.length <= DIRECT_INTRADAY_LIVE_SYMBOL_LIMIT;
      let benchmarkRows = [];
      try {
        benchmarkRows = await historyRows(api, DIRECT_BENCHMARK_SYMBOL, 'D', DIRECT_DAILY_HISTORY_DAYS);
      } catch {
        benchmarkRows = [];
      }
      const results = await mapWithConcurrency(symbols, Math.min(DIRECT_SCREENER_CONCURRENCY, symbols.length), async (symbol) => {
        try {
          const row = await buildDirectRow(api, symbol, benchmarkRows, { includeIntraday: includeIntradayHistory });
          if (!row) {
            return { error: { Ticker: symbol, Error: 'Insufficient history for direct FYERS screener row.' } };
          }
          return { row };
        } catch (error) {
          return { error: { Ticker: symbol, Error: error.message } };
        }
      });

      const rows = results.filter((item) => item.row).map((item) => item.row);
      const errors = results.filter((item) => item.error).map((item) => item.error);
      let quotes = {};
      try {
        quotes = quoteMap(await api.quotes(symbols));
      } catch {
        quotes = {};
      }

      const quotedRows = rows.map((row) => applyDirectQuoteRow(row, quotes[row.Ticker]));
      const ratedRows = addDirectRsRating(quotedRows);
      const rankedRows = ratedRows.sort((a, b) => ((asNumber(b.Score) || 0) - (asNumber(a.Score) || 0)) || ((asNumber(b.AI_Prob) || 0) - (asNumber(a.AI_Prob) || 0)));
      const liveRows = rankedRows.map((row) => directLiveRow(row)).sort((a, b) => (asNumber(b.Combined_AI_Prob) || 0) - (asNumber(a.Combined_AI_Prob) || 0));

      res.json({
        status: 'ok',
        source: 'fyers-direct',
        overview: directOverview(rankedRows),
        datasets: {
          allRanked: rankedRows,
          liveMarket: liveRows,
          errors,
        },
      });
    } catch (error) {
      res.status(400).json({ status: 'error', message: `Unable to load direct screener data: ${error.message}` });
    }
  });

  app.get('/api/watchlists/catalog', async (_req, res) => {
    try {
      const localWatchlists = await loadWatchlists();
      const predefinedLists = await buildPredefinedLists();
      let smartLists = [];
      let source = { broker_connected: false, message: 'Using fallback data' };

      try {
        const api = await loadApi();
        const [holdings, positions, tradebook] = await Promise.all([api.holdings(), api.positions(), api.tradebook()]);
        const holdingsSymbols = uniqueSymbolsFromRows(holdings?.holdings || [], ['symbol', 'n']);
        const positionsSymbols = uniqueSymbolsFromRows(positions?.netPositions || [], ['symbol', 'n', 'tradingsymbol']);
        const tradesSymbols = uniqueSymbolsFromRows(tradebook?.tradeBook || [], ['symbol', 'n', 'tradingsymbol']);

        if (holdingsSymbols.length) smartLists.push({ id: 'holdings', name: 'From Holdings', symbols: holdingsSymbols.slice(0, 50) });
        if (positionsSymbols.length) smartLists.push({ id: 'positions', name: 'Open Positions', symbols: positionsSymbols.slice(0, 50) });
        if (tradesSymbols.length) smartLists.push({ id: 'trades', name: 'Recent Trades', symbols: tradesSymbols.slice(0, 50) });
        source = { broker_connected: true, message: 'Live broker data' };
      } catch (error) {
        source = { broker_connected: false, message: error.message };
      }

      if (!smartLists.length) {
        smartLists = Object.entries(localWatchlists).slice(0, 3).map(([name, symbols]) => ({
          id: `wl-${String(name).toLowerCase().replace(/\s+/g, '-')}`,
          name,
          symbols: (symbols || []).slice(0, 50),
        }));
      }

      res.json({ tabs: { my: { watchlists: localWatchlists }, predefined: { lists: predefinedLists }, smart: { lists: smartLists } }, source });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/watchlists', async (_req, res) => {
    res.json({ watchlists: await loadWatchlists() });
  });

  app.post('/api/watchlists', async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ status: 'error', message: 'name is required' });
    }
    const watchlists = await loadWatchlists();
    if (watchlists[name]) {
      return res.status(409).json({ status: 'error', message: `Watchlist '${name}' already exists` });
    }
    watchlists[name] = [];
    await saveWatchlists(watchlists);
    return res.status(201).json({ status: 'ok', watchlists });
  });

  app.delete('/api/watchlists/:name', async (req, res) => {
    const { name } = req.params;
    const watchlists = await loadWatchlists();
    if (!watchlists[name]) {
      return res.status(404).json({ status: 'error', message: 'Watchlist not found' });
    }
    delete watchlists[name];
    await saveWatchlists(watchlists);
    return res.json({ status: 'ok', watchlists });
  });

  app.post('/api/watchlists/:name/symbols', async (req, res) => {
    const { name } = req.params;
    const symbol = normalizeSymbol(req.body?.symbol || '');
    if (!symbol) {
      return res.status(400).json({ status: 'error', message: 'symbol is required' });
    }
    const watchlists = await loadWatchlists();
    if (!watchlists[name]) {
      return res.status(404).json({ status: 'error', message: 'Watchlist not found' });
    }
    if (!watchlists[name].includes(symbol)) {
      watchlists[name].push(symbol);
      await saveWatchlists(watchlists);
    }
    return res.json({ status: 'ok', symbols: watchlists[name] });
  });

  app.delete('/api/watchlists/:name/symbols/:symbol', async (req, res) => {
    const { name, symbol } = req.params;
    const watchlists = await loadWatchlists();
    if (!watchlists[name]) {
      return res.status(404).json({ status: 'error', message: 'Watchlist not found' });
    }
    watchlists[name] = watchlists[name].filter((item) => item !== symbol);
    await saveWatchlists(watchlists);
    return res.json({ status: 'ok', symbols: watchlists[name] });
  });

  app.get('/api/alerts/price', async (req, res) => {
    try {
      const archive = parseBooleanFlag(req.query.archive);
      const api = await loadApi();
      const brokerResponse = ensureBrokerOk(
        await api.getPriceAlert(archive ? { archive: '1' } : undefined),
        'Failed to fetch price alerts.',
      );
      return res.json({ status: 'ok', archive, alerts: buildPriceAlertList(brokerResponse) });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.post('/api/alerts/price', async (req, res) => {
    try {
      const api = await loadApi();
      const payload = buildPriceAlertPayload(req.body);
      const brokerResponse = ensureBrokerOk(
        await api.createPriceAlert(payload),
        'Failed to create price alert.',
      );
      return res.status(201).json({ status: 'ok', message: brokerResponse?.message || 'Price alert created.' });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.put('/api/alerts/price/:alertId', async (req, res) => {
    try {
      const api = await loadApi();
      const payload = buildPriceAlertPayload({ ...req.body, alertId: req.params.alertId }, { requireAlertId: true });
      const brokerResponse = ensureBrokerOk(
        await api.modifyPriceAlert(payload),
        'Failed to update price alert.',
      );
      return res.json({ status: 'ok', message: brokerResponse?.message || 'Price alert updated.' });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.put('/api/alerts/price/:alertId/toggle', async (req, res) => {
    try {
      const api = await loadApi();
      const alertId = asTrimmedString(req.params.alertId);
      if (!alertId) {
        throw new Error('alertId is required');
      }
      const brokerResponse = ensureBrokerOk(
        await api.togglePriceAlert({ alertId }),
        'Failed to toggle price alert.',
      );
      return res.json({ status: 'ok', message: brokerResponse?.message || 'Price alert toggled.' });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.delete('/api/alerts/price/:alertId', async (req, res) => {
    try {
      const api = await loadApi();
      const alertId = asTrimmedString(req.params.alertId);
      if (!alertId) {
        throw new Error('alertId is required');
      }
      const brokerResponse = ensureBrokerOk(
        await api.deletePriceAlert({ alertId, agent: PRICE_ALERT_DEFAULT_AGENT }),
        'Failed to delete price alert.',
      );
      return res.json({ status: 'ok', message: brokerResponse?.message || 'Price alert deleted.' });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  function attachServer(server) {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== '/api/live') {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    wss.on('connection', async (ws, request) => {
      const url = new URL(request.url, 'http://localhost');
      const mode = String(url.searchParams.get('mode') || '').trim().toLowerCase();
      const depth = parseBooleanFlag(url.searchParams.get('depth'));
      const symbols = String(url.searchParams.get('symbols') || '')
        .split(',')
        .map((symbol) => symbol.trim())
        .filter(Boolean);
      const channels = String(url.searchParams.get('channels') || '')
        .split(',')
        .map((channel) => channel.trim())
        .filter(Boolean);

      if (mode === 'quotes') {
        let clientId = null;
        try {
          const targetSymbols = symbols.length ? symbols : ['NSE:NIFTY50-INDEX', 'NSE:NIFTYBANK-INDEX', 'NSE:SBIN-EQ', 'NSE:RELIANCE-EQ'];
          clientId = await quoteHub.registerClient(ws, targetSymbols, { depth });
          ws.on('close', () => {
            if (clientId !== null) {
              quoteHub.unregisterClient(clientId);
            }
          });
        } catch (error) {
          ws.send(JSON.stringify({ mode: 'quotes', type: 'error', message: error.message }));
          ws.close();
        }
        return;
      }

      if (mode === 'events') {
        let clientId = null;
        try {
          clientId = await orderEventHub.registerClient(ws, channels);
          ws.on('close', () => {
            if (clientId !== null) {
              orderEventHub.unregisterClient(clientId);
            }
          });
        } catch (error) {
          ws.send(JSON.stringify({ mode: 'events', type: 'error', message: error.message }));
          ws.close();
        }
        return;
      }

      let timer = null;
      const targetSymbols = symbols.length ? symbols : ['NSE:NIFTY50-INDEX', 'NSE:NIFTYBANK-INDEX', 'NSE:SBIN-EQ', 'NSE:RELIANCE-EQ'];
      const sendPayload = async () => {
        try {
          const api = await loadApi();
          const payload = await buildDashboardPayload(api);
          payload.watchlist = await api.quotes(targetSymbols);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify(payload));
          }
        } catch (error) {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ status: 'error', message: error.message }));
          }
        }
      };

      await sendPayload();
      timer = setInterval(sendPayload, 5000);
      ws.on('close', () => {
        if (timer) {
          clearInterval(timer);
        }
      });
    });
  }

  return { app, attachServer };
}
