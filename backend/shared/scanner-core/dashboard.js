import { buildSheetDatasets, isKnownSector } from './engine.js'

export const DATASET_SHEET_MAP = {
  allRanked: 'All_Ranked',
  strongBuy: 'Strong_Buy',
  buy: 'Buy',
  hold: 'Hold',
  sell: 'Sell',
  avoid: 'Avoid',
  breakout52w: 'Breakout_52W',
  volBreakout: 'Vol_Breakout',
  accumulation: 'Accumulation',
  aiPicks: 'AI_Picks',
  topGainers: 'Top_Gainers',
  topLosers: 'Top_Losers',
  sectorLeaderboard: 'Sector_Leaderboard',
  sectorSummary: 'Sector_Summary',
  sectorRotation: 'Sector_Rotation',
  marketBreadth: 'Market_Breadth',
  aiPortfolio: 'AI_Portfolio',
  liveMarket: 'Live_Market',
  errors: 'Errors',
}

export function datasetKeyToSheet(key) {
  return DATASET_SHEET_MAP[key]
}

export function sliceRows(rows, limit) {
  if (!Array.isArray(rows)) return []
  if (!Number.isFinite(limit) || limit <= 0) return rows
  return rows.slice(0, limit)
}

export function buildOverview(datasets) {
  const allRanked = datasets.allRanked || []
  const sectorSummary = datasets.sectorSummary || []
  const bestSector = sectorSummary.find((row) => isKnownSector(row?.Sector))?.Sector || '-'
  return {
    totalScanned: allRanked.length,
    strongBuy: (datasets.strongBuy || []).length,
    buy: (datasets.buy || []).length,
    sell: (datasets.sell || []).length,
    aiPicks: (datasets.aiPicks || []).length,
    accumulation: (datasets.accumulation || []).length,
    bestSector,
  }
}

export function buildClientDatasetsFromSheetRows(sheetRows, limit = null) {
  return Object.fromEntries(
    Object.entries(DATASET_SHEET_MAP).map(([key, sheetName]) => [key, sliceRows(sheetRows[sheetName] || [], limit)])
  )
}

export function buildClientScannerPayloadFromSheetRows(sheetRows, limit = null) {
  const datasets = buildClientDatasetsFromSheetRows(sheetRows, limit)
  return {
    datasets,
    overview: buildOverview(datasets),
  }
}

export function buildClientScannerPayloadFromRows(rows, liveRows = [], errors = [], limit = null) {
  const sheetRows = buildSheetDatasets(rows, liveRows, errors)
  return buildClientScannerPayloadFromSheetRows(sheetRows, limit)
}