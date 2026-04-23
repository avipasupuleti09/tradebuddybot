import { fromFyersTicker, linearSlope, mean, minMaxNormalize, pct, rollingMean, round } from './utils.js'

export const DEFAULT_SCANNER_CORE_CONFIG = {
  lookback52w: 252,
  nearPct52w: 0.25,
  ma50: 50,
  ma200: 200,
  volSpikeMult: 1.5,
  volBreakoutMult: 2.0,
  gapUpPct: 2.0,
  atrPeriod: 14,
  atrStopMult: 2.0,
  riskPerTradeInr: 1000,
  srLookbackDays: 60,
  cmfPeriod: 20,
  obvSlopeDays: 20,
  accumScoreMin: 60,
  aiProbMin: 0.55,
}

function resolveConfig(config = {}) {
  return { ...DEFAULT_SCANNER_CORE_CONFIG, ...config }
}

function closeSeries(rows) {
  return rows.map((row) => row.close)
}

function volumeSeries(rows) {
  return rows.map((row) => row.volume)
}

function highs(rows) {
  return rows.map((row) => row.high)
}

function lows(rows) {
  return rows.map((row) => row.low)
}

export function calculateRsi(values, period = 14) {
  if (values.length <= period) return null
  const gains = []
  const losses = []
  for (let i = values.length - period; i < values.length; i += 1) {
    const change = values[i] - values[i - 1]
    gains.push(Math.max(change, 0))
    losses.push(Math.max(-change, 0))
  }
  const avgGain = mean(gains)
  const avgLoss = mean(losses)
  if (avgGain === null || avgLoss === null) return null
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

export function calculateAtr(rows, period = DEFAULT_SCANNER_CORE_CONFIG.atrPeriod) {
  if (rows.length < period + 1) return null
  const trs = []
  for (let i = rows.length - period; i < rows.length; i += 1) {
    const high = rows[i].high
    const low = rows[i].low
    const prevClose = rows[i - 1].close
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))
  }
  return mean(trs)
}

export function calculateCmf(rows, period = DEFAULT_SCANNER_CORE_CONFIG.cmfPeriod) {
  if (rows.length < period) return null
  let mfv = 0
  let volume = 0
  for (let i = rows.length - period; i < rows.length; i += 1) {
    const row = rows[i]
    const range = row.high - row.low
    if (!range) continue
    const mfm = ((row.close - row.low) - (row.high - row.close)) / range
    mfv += mfm * row.volume
    volume += row.volume
  }
  return volume ? mfv / volume : null
}

export function calculateObvSlope(rows, period = DEFAULT_SCANNER_CORE_CONFIG.obvSlopeDays) {
  if (rows.length < period + 1) return null
  let obv = 0
  const values = []
  for (let i = rows.length - period; i < rows.length; i += 1) {
    const prevClose = rows[i - 1].close
    const currentClose = rows[i].close
    if (currentClose > prevClose) obv += rows[i].volume
    else if (currentClose < prevClose) obv -= rows[i].volume
    values.push(obv)
  }
  return linearSlope(values)
}

export function computeSupportResistance(rows, lookbackDays = DEFAULT_SCANNER_CORE_CONFIG.srLookbackDays) {
  const slice = rows.slice(-lookbackDays)
  if (!slice.length) return { support: null, resistance: null }
  return {
    support: round(Math.min(...slice.map((row) => row.low)), 2),
    resistance: round(Math.max(...slice.map((row) => row.high)), 2),
  }
}

export function classifySignal(row) {
  const aiPick = Boolean(row.AI_Pick)
  const accumulation = Boolean(row.Accumulation)
  const volBreakout = Boolean(row.VolBreakout)
  const above200dma = Boolean(row.Above200DMA)
  const dayChange = row['DayChange_%']
  const rsRating = row.RS_rating_1_100

  if (aiPick && accumulation && volBreakout && above200dma) return 'STRONG BUY'
  if (aiPick && accumulation && above200dma) return 'BUY'
  if (dayChange !== null && dayChange < 0 && rsRating !== null && rsRating < 40 && !accumulation && !above200dma) return 'SELL'
  if (!aiPick && !accumulation && !volBreakout && dayChange !== null && dayChange < 0) return 'AVOID'
  return 'HOLD'
}

export function intradaySignal(intradayRows, config = {}) {
  if (!intradayRows?.length) {
    return { prob: null, momentum: null, ret1: null, ret6: null, dayRet: null, vwapDist: null, timestamp: null }
  }

  const closes = closeSeries(intradayRows)
  const volumes = volumeSeries(intradayRows)
  const latest = intradayRows[intradayRows.length - 1]
  const ret1 = pct(closes.at(-1), closes.at(-2))
  const ret6 = intradayRows.length > 6 ? pct(closes.at(-1), closes.at(-7)) : null
  const volRatio5 = volumes.length >= 5 ? closes.length && volumeSeries(intradayRows).at(-1) / mean(volumes.slice(-5)) : null
  const rsi14 = calculateRsi(closes, 14)
  const slope = intradayRows.length >= 12 ? linearSlope(closes.slice(-12)) : null
  const sessionOpen = intradayRows[0].open
  const dayRet = sessionOpen ? pct(closes.at(-1), sessionOpen) : null
  const typicalPrices = intradayRows.map((row) => (row.high + row.low + row.close) / 3)
  let cumulativeTpv = 0
  let cumulativeVol = 0
  for (let i = 0; i < intradayRows.length; i += 1) {
    cumulativeTpv += typicalPrices[i] * intradayRows[i].volume
    cumulativeVol += intradayRows[i].volume
  }
  const vwap = cumulativeVol ? cumulativeTpv / cumulativeVol : null
  const vwapDist = vwap ? pct(closes.at(-1), vwap + 0.000001) : null
  const probability = mean([
    minMaxNormalize(ret1 ?? 0, -1.5, 1.5),
    minMaxNormalize(ret6 ?? 0, -3, 3),
    minMaxNormalize(dayRet ?? 0, -3, 3),
    minMaxNormalize(vwapDist ?? 0, -2, 2),
    minMaxNormalize((volRatio5 ?? 1) - 1, 0, 2),
    minMaxNormalize((rsi14 ?? 50) - 50, -20, 20),
    minMaxNormalize(slope ?? 0, -2, 2),
  ])
  const momentum = mean([
    probability !== null ? probability * 100 : null,
    minMaxNormalize(dayRet ?? 0, -3, 3) * 100,
    minMaxNormalize(vwapDist ?? 0, -2, 2) * 100,
  ])

  return {
    prob: round(probability, 4),
    momentum: round(momentum, 2),
    ret1: round(ret1, 3),
    ret6: round(ret6, 3),
    dayRet: round(dayRet, 3),
    vwapDist: round(vwapDist, 3),
    timestamp: latest.date,
  }
}

export function buildDailyRow(ticker, rows, benchmarkRows, sectorName, deliveryPct, intraday, config = {}) {
  const settings = resolveConfig(config)
  if (!rows || rows.length < 80) return null

  const closes = closeSeries(rows)
  const volumes = volumeSeries(rows)
  const latest = rows.at(-1)
  const previous = rows.at(-2)
  const currentPrice = latest.close
  const dayOpen = latest.open
  const prevClose = previous?.close ?? null
  const dayChangePct = prevClose ? pct(currentPrice, prevClose) : null
  const windowRows = rows.slice(-settings.lookback52w)
  const high52 = Math.max(...highs(windowRows))
  const low52 = Math.min(...lows(windowRows))
  const distHigh = ((high52 - currentPrice) / high52) * 100
  const distLow = ((currentPrice - low52) / low52) * 100
  const nearHigh = distHigh <= settings.nearPct52w
  const nearLow = distLow <= settings.nearPct52w
  const avg20 = mean(volumes.slice(-20))
  const volRatio = avg20 ? latest.volume / avg20 : null
  const volSpike = volRatio !== null && volRatio >= settings.volSpikeMult
  const volBreakout = volRatio !== null && volRatio >= settings.volBreakoutMult
  const ma50 = rollingMean(closes, settings.ma50, closes.length - 1)
  const ma200 = rollingMean(closes, settings.ma200, closes.length - 1)
  const above200dma = ma200 !== null ? currentPrice > ma200 : null
  const high20 = Math.max(...highs(rows.slice(-20)))
  const breakout20d = currentPrice >= high20
  const gapUpPct = prevClose ? pct(dayOpen, prevClose) : null
  const gapUp = gapUpPct !== null && gapUpPct >= settings.gapUpPct
  const sma5 = rollingMean(closes, 5, closes.length - 1)
  const reversalLow = nearLow && sma5 !== null && currentPrice > sma5
  const atr = calculateAtr(rows, settings.atrPeriod)
  const stopLoss = atr !== null ? currentPrice - settings.atrStopMult * atr : null
  const riskPerShare = stopLoss !== null ? currentPrice - stopLoss : null
  const qty = riskPerShare && riskPerShare > 0 ? Math.floor(settings.riskPerTradeInr / riskPerShare) : null
  const { support, resistance } = computeSupportResistance(rows, settings.srLookbackDays)
  const cmf20 = calculateCmf(rows, settings.cmfPeriod)
  const obvSlope = calculateObvSlope(rows, settings.obvSlopeDays)
  const rsi14 = calculateRsi(closes, 14)
  const accumScore = mean([
    minMaxNormalize(cmf20 ?? 0, -0.2, 0.2) * 100,
    minMaxNormalize(obvSlope ?? 0, -1000000, 1000000) * 100,
    minMaxNormalize(volRatio ?? 0, 0.5, 2.5) * 100,
    minMaxNormalize(rsi14 ?? 50, 40, 80) * 100,
  ])
  const accumulation = accumScore !== null && accumScore >= settings.accumScoreMin && Boolean(above200dma)
  const rs3 = benchmarkRows?.length > 63 ? pct(currentPrice, closes.at(-64)) - pct(benchmarkRows.at(-1).close, benchmarkRows.at(-64).close) : null
  const rs6 = benchmarkRows?.length > 126 ? pct(currentPrice, closes.at(-127)) - pct(benchmarkRows.at(-1).close, benchmarkRows.at(-127).close) : null
  const aiProb = mean([
    intraday.prob,
    minMaxNormalize(volRatio ?? 0, 0.5, 2.5),
    minMaxNormalize(rsi14 ?? 50, 40, 80),
    minMaxNormalize(rs3 ?? 0, -10, 10),
    minMaxNormalize(rs6 ?? 0, -15, 15),
    minMaxNormalize(dayChangePct ?? 0, -5, 5),
  ])
  const aiPick = aiProb !== null && aiProb >= settings.aiProbMin
  let score = 0
  if (nearHigh) score += 35
  if (breakout20d) score += 20
  if (volSpike) score += 15
  if (above200dma) score += 10
  if (volBreakout) score += 10
  if (gapUp) score += 5
  if (accumulation) score += 5
  if ((intraday.momentum ?? 0) > 60) score += 10

  const row = {
    Ticker: ticker,
    LastDate: latest.date ? latest.date.slice(0, 10) : null,
    DayOpen: round(dayOpen, 2),
    CurrentPrice: round(currentPrice, 2),
    DayClosePrice: round(currentPrice, 2),
    'DayChange_%': round(dayChangePct, 3),
    Sector: sectorName,
    DeliveryPct: deliveryPct ?? null,
    '52W_High': round(high52, 2),
    '52W_Low': round(low52, 2),
    'DistFrom52WHigh_%': round(distHigh, 4),
    'DistFrom52WLow_%': round(distLow, 4),
    Volume: latest.volume,
    AvgVol20: round(avg20, 0),
    VolRatio: round(volRatio, 3),
    VolSpike: Boolean(volSpike),
    VolBreakout: Boolean(volBreakout),
    MA50: round(ma50, 2),
    MA200: round(ma200, 2),
    Above200DMA: above200dma,
    GapUp: Boolean(gapUp),
    'GapUp_%': round(gapUpPct, 3),
    Near52WHigh: Boolean(nearHigh),
    Near52WLow: Boolean(nearLow),
    Breakout20D: Boolean(breakout20d),
    ReversalFromLow: Boolean(reversalLow),
    Support: support,
    Resistance: resistance,
    'RS_3M_vs_NIFTY_%': round(rs3, 3),
    'RS_6M_vs_NIFTY_%': round(rs6, 3),
    CMF20: round(cmf20, 4),
    OBV_Slope20: round(obvSlope, 2),
    RSI14: round(rsi14, 2),
    AccumScore: round(accumScore, 1),
    Accumulation: Boolean(accumulation),
    ATR14: round(atr, 3),
    StopLoss_ATR: round(stopLoss, 2),
    RiskPerShare: round(riskPerShare, 2),
    'Qty_for_Risk(INR)': qty,
    AI_Prob: round(aiProb, 4),
    AI_Pick: Boolean(aiPick),
    Intraday_AI_Prob: intraday.prob,
    IntradayMomentumScore: intraday.momentum,
    'IntradayRet_1Bar_%': intraday.ret1,
    'IntradayRet_6Bar_%': intraday.ret6,
    'DayRetFromOpen_%': intraday.dayRet,
    'VWAPDist_%': intraday.vwapDist,
    IntradayTimestamp: intraday.timestamp,
    Score: score,
  }
  row.Signal = classifySignal(row)
  return row
}

export function addRsRating(rows) {
  const rsValues = rows.map((row) => row['RS_3M_vs_NIFTY_%'] ?? null)
  const valid = rsValues.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  return rows.map((row) => {
    if (!Number.isFinite(row['RS_3M_vs_NIFTY_%'])) return { ...row, RS_rating_1_100: null }
    const position = valid.findIndex((value) => value === row['RS_3M_vs_NIFTY_%'])
    const rating = Math.round(((position + 1) / valid.length) * 99 + 1)
    return { ...row, RS_rating_1_100: rating }
  })
}

export function isKnownSector(value) {
  const sector = String(value || '').trim().toLowerCase()
  return Boolean(sector) && sector !== 'unknown' && sector !== '-'
}

export function buildSheetDatasets(rows, liveRows, errors) {
  const sorted = [...rows].sort((a, b) => (b.Score ?? 0) - (a.Score ?? 0))
  const sheetMap = {
    All_Ranked: sorted,
    Strong_Buy: sorted.filter((row) => row.Signal === 'STRONG BUY'),
    Buy: sorted.filter((row) => row.Signal === 'BUY'),
    Hold: sorted.filter((row) => row.Signal === 'HOLD'),
    Sell: sorted.filter((row) => row.Signal === 'SELL'),
    Avoid: sorted.filter((row) => row.Signal === 'AVOID'),
    Breakout_52W: sorted.filter((row) => row.Near52WHigh && row.VolSpike && row.Above200DMA),
    Vol_Breakout: sorted.filter((row) => row.VolBreakout && row.Above200DMA),
    Breakout_20D: sorted.filter((row) => row.Breakout20D),
    Accumulation: sorted.filter((row) => row.Accumulation),
    AI_Picks: sorted.filter((row) => row.AI_Pick),
    GapUps: sorted.filter((row) => row.GapUp),
    Low_Reversal: sorted.filter((row) => row.ReversalFromLow),
    Top_Gainers: [...sorted].sort((a, b) => (b['DayChange_%'] ?? 0) - (a['DayChange_%'] ?? 0)).slice(0, 30),
    Top_Losers: [...sorted].sort((a, b) => (a['DayChange_%'] ?? 0) - (b['DayChange_%'] ?? 0)).slice(0, 30),
  }

  const sectorSummaryMap = new Map()
  for (const row of sorted) {
    const key = row.Sector || 'Unknown'
    const current = sectorSummaryMap.get(key) || { Sector: key, Count: 0, StrongBuy: 0, Buy: 0, Sell: 0, AvgRSValues: [] }
    current.Count += 1
    if (row.Signal === 'STRONG BUY') current.StrongBuy += 1
    if (row.Signal === 'BUY') current.Buy += 1
    if (row.Signal === 'SELL') current.Sell += 1
    if (Number.isFinite(row.RS_rating_1_100)) current.AvgRSValues.push(row.RS_rating_1_100)
    sectorSummaryMap.set(key, current)
  }

  const sectorSummary = [...sectorSummaryMap.values()].map((item) => ({
    Sector: item.Sector,
    Count: item.Count,
    StrongBuy: item.StrongBuy,
    Buy: item.Buy,
    Sell: item.Sell,
    AvgRS: round(mean(item.AvgRSValues), 1),
  })).sort((a, b) => {
    const knownDelta = Number(isKnownSector(b.Sector)) - Number(isKnownSector(a.Sector))
    if (knownDelta !== 0) return knownDelta
    return (b.StrongBuy - a.StrongBuy) || (b.Buy - a.Buy) || ((b.AvgRS ?? 0) - (a.AvgRS ?? 0))
  })

  const sectorRotation = sectorSummary.map((sector) => {
    const sectorRows = sorted.filter((row) => row.Sector === sector.Sector)
    return {
      Sector: sector.Sector,
      AvgRS: round(mean(sectorRows.map((row) => row.RS_rating_1_100)), 2),
      AvgScore: round(mean(sectorRows.map((row) => row.Score)), 2),
      Count: sectorRows.length,
      StrongBuy: sector.StrongBuy,
      Buy: sector.Buy,
      Sell: sector.Sell,
    }
  })

  const bullish = sorted.filter((row) => ['BUY', 'STRONG BUY'].includes(row.Signal)).length
  const neutral = sorted.filter((row) => row.Signal === 'HOLD').length
  const bearish = sorted.filter((row) => ['SELL', 'AVOID'].includes(row.Signal)).length
  const marketBreadth = [
    { Type: 'Bullish', Count: bullish },
    { Type: 'Neutral', Count: neutral },
    { Type: 'Bearish', Count: bearish },
  ]

  const aiPortfolio = sorted
    .filter((row) => row.AI_Prob !== null)
    .sort((a, b) => (b.AI_Prob ?? 0) - (a.AI_Prob ?? 0))
    .slice(0, 10)
    .map((row) => ({
      Ticker: row.Ticker,
      Signal: row.Signal,
      Sector: row.Sector,
      Price: row.CurrentPrice,
      StopLoss: row.StopLoss_ATR,
      RiskPerShare: row.RiskPerShare,
      Qty: row['Qty_for_Risk(INR)'],
      Allocation: row['Qty_for_Risk(INR)'] && row.CurrentPrice ? round(row['Qty_for_Risk(INR)'] * row.CurrentPrice, 2) : null,
      AI_Prob: row.AI_Prob,
      RS_rating_1_100: row.RS_rating_1_100,
      Score: row.Score,
      TargetResistance: row.Resistance,
    }))

  return {
    ...sheetMap,
    Sector_Leaderboard: sectorRotation,
    Sector_Summary: sectorSummary,
    Sector_Rotation: sectorRotation,
    Market_Breadth: marketBreadth,
    AI_Portfolio: aiPortfolio,
    Live_Market: liveRows,
    Errors: errors,
  }
}

export function convertSheetRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? null])))
}

export { fromFyersTicker }