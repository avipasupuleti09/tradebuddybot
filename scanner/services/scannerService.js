import config from './config.js'
import { fetchBatchDailyHistory, fetchBatchIntradayHistory, fetchSectorName } from './marketDataService.js'
import {
  loadDeliveryOverrides,
  loadSectorOverrides,
  loadWatchlist,
  normalizeRequestedOverrides,
  normalizeRequestedWatchlist,
} from './watchlistService.js'
import { writeWorkbook } from './xlsxStore.js'
import {
  addRsRating,
  buildDailyRow,
  buildSheetDatasets,
  convertSheetRows,
  datasetKeyToSheet,
  fromFyersTicker,
  intradaySignal,
  mean,
  round,
} from '../../shared/scanner-core/index.js'

async function generateScan(limit = null, persist = true, requestOptions = {}) {
  const requestedWatchlist = normalizeRequestedWatchlist(requestOptions.watchlistSymbols, limit)
  const requestedSectorOverrides = normalizeRequestedOverrides(requestOptions.sectorOverrides, ['sector', 'Sector', 'value', 'Value'])
  const requestedDeliveryOverrides = normalizeRequestedOverrides(requestOptions.deliveryOverrides, ['deliveryPct', 'DeliveryPct', 'delivery', 'Delivery', 'value', 'Value'])

  const [defaultTickers, defaultSectorOverrides, defaultDeliveryOverrides] = await Promise.all([
    requestedWatchlist.length ? [] : loadWatchlist(limit),
    Object.keys(requestedSectorOverrides).length ? {} : loadSectorOverrides(),
    Object.keys(requestedDeliveryOverrides).length ? {} : loadDeliveryOverrides(),
  ])

  const tickers = requestedWatchlist.length ? requestedWatchlist : defaultTickers
  const sectorOverrides = Object.keys(requestedSectorOverrides).length ? requestedSectorOverrides : defaultSectorOverrides
  const deliveryOverrides = Object.keys(requestedDeliveryOverrides).length ? requestedDeliveryOverrides : defaultDeliveryOverrides

  if (!tickers.length) {
    return buildSheetDatasets([], [], [{ Ticker: null, Error: 'No watchlist symbols available from env, API, or fallback source.' }])
  }

  const [dailyMap, intradayMap, benchmarkRows] = await Promise.all([
    fetchBatchDailyHistory(tickers),
    fetchBatchIntradayHistory(tickers),
    fetchBatchDailyHistory([config.benchmark]).then((map) => map[config.benchmark] || []),
  ])

  const sectorEntries = await Promise.all(tickers.map(async (ticker) => {
    const symbol = fromFyersTicker(ticker)
    if (sectorOverrides[symbol]) return [ticker, sectorOverrides[symbol]]
    return [ticker, await fetchSectorName(ticker)]
  }))
  const sectorMap = Object.fromEntries(sectorEntries)

  const errors = []
  let rows = tickers.map((ticker) => {
    try {
      const dailyRows = dailyMap[ticker] || []
      const intraday = intradaySignal(intradayMap[ticker] || [], config)
      return buildDailyRow(
        ticker,
        dailyRows,
        benchmarkRows,
        sectorMap[ticker] || 'Unknown',
        deliveryOverrides[fromFyersTicker(ticker)] ?? null,
        intraday,
        config,
      )
    } catch (error) {
      errors.push({ Ticker: ticker, Error: String(error.message || error) })
      return null
    }
  }).filter(Boolean)

  rows = addRsRating(rows).sort((a, b) => ((b.Score ?? 0) - (a.Score ?? 0)) || ((b.AI_Prob ?? 0) - (a.AI_Prob ?? 0)))

  const liveRows = Object.entries(intradayMap)
    .map(([ticker, intradayRows]) => {
      const signal = intradaySignal(intradayRows, config)
      const dailyRow = rows.find((row) => row.Ticker === ticker)
      const latestDaily = (dailyMap[ticker] || []).at(-1)
      if (!latestDaily) return null
      return {
        Ticker: ticker,
        Sector: dailyRow?.Sector ?? 'Unknown',
        Signal: dailyRow?.Signal ?? 'HOLD',
        Price: round(latestDaily.close, 2),
        'Change_%': dailyRow?.['DayChange_%'] ?? null,
        'Gap_%': dailyRow?.['GapUp_%'] ?? null,
        'DayRetFromOpen_%': signal.dayRet,
        'VWAPDist_%': signal.vwapDist,
        'IntradayRet_1Bar_%': signal.ret1,
        'IntradayRet_6Bar_%': signal.ret6,
        Intraday_AI_Prob: signal.prob,
        AI_Prob: dailyRow?.AI_Prob ?? null,
        Combined_AI_Prob: mean([signal.prob, dailyRow?.AI_Prob ?? null]),
        IntradayMomentumScore: signal.momentum,
        RS_rating_1_100: dailyRow?.RS_rating_1_100 ?? null,
        Score: dailyRow?.Score ?? null,
        Volume: latestDaily.volume,
        IntradayTimestamp: signal.timestamp,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.Combined_AI_Prob ?? 0) - (a.Combined_AI_Prob ?? 0))

  const datasets = buildSheetDatasets(rows, liveRows, errors)
  if (persist && config.persistWorkbook) {
    await writeWorkbook(Object.fromEntries(Object.entries(datasets).map(([sheet, value]) => [sheet, convertSheetRows(value)])))
  }
  return datasets
}

export async function runFullScan(limit = null, requestOptions = {}) {
  return generateScan(limit, true, requestOptions)
}

export async function getLiveSnapshot(limit = config.liveScannerTickerLimit, requestOptions = {}) {
  const datasets = await generateScan(limit, false, requestOptions)
  return datasets.Live_Market || []
}

export { datasetKeyToSheet }
