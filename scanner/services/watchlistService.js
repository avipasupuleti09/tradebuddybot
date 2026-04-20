import config from './config.js'
import { toFyersTicker } from './utils.js'
import { loadSheetRows } from './xlsxStore.js'

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AI-STOCK/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`${label} request failed: ${response.status}`)
  }

  return response.json()
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

function extractWatchlistRows(payload) {
  const directWatchlists = payload?.watchlists
  if (directWatchlists && typeof directWatchlists === 'object' && !Array.isArray(directWatchlists)) {
    for (const symbols of Object.values(directWatchlists)) {
      if (Array.isArray(symbols) && symbols.length) return symbols
    }
  }

  const catalogWatchlists = payload?.tabs?.my?.watchlists
  if (catalogWatchlists && typeof catalogWatchlists === 'object' && !Array.isArray(catalogWatchlists)) {
    for (const symbols of Object.values(catalogWatchlists)) {
      if (Array.isArray(symbols) && symbols.length) return symbols
    }
  }

  return extractRows(payload)
}

function normalizeSymbol(value) {
  return toFyersTicker(typeof value === 'string' ? value : String(value ?? '').trim())
}

function normalizeWatchlistRows(rows) {
  const tickers = rows
    .map((row) => {
      if (typeof row === 'string') return normalizeSymbol(row)
      return normalizeSymbol(row?.symbol ?? row?.Symbol ?? row?.ticker ?? row?.Ticker ?? row?.code ?? row?.Code)
    })
    .filter(Boolean)

  return [...new Set(tickers)]
}

export function normalizeRequestedWatchlist(input, limit = null) {
  const rows = Array.isArray(input)
    ? input
    : String(input ?? '')
      .split(/[\r\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)

  const tickers = normalizeWatchlistRows(rows)
  return limit ? tickers.slice(0, limit) : tickers
}

function normalizeOverrideMap(payload, valueKeys) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object' && !Array.isArray(payload?.items) && !Array.isArray(payload?.data) && !Array.isArray(payload?.results) && !Array.isArray(payload?.rows)) {
    return Object.fromEntries(
      Object.entries(payload)
        .map(([symbol, value]) => [String(symbol || '').trim().toUpperCase(), value])
        .filter(([symbol]) => symbol)
    )
  }

  const rows = extractRows(payload)
  return Object.fromEntries(
    rows
      .map((row) => {
        const symbol = String(row?.symbol ?? row?.Symbol ?? row?.ticker ?? row?.Ticker ?? row?.code ?? row?.Code ?? '').trim().toUpperCase()
        const value = valueKeys.reduce((result, key) => result ?? row?.[key], null)
        return [symbol, value]
      })
      .filter(([symbol, value]) => symbol && value !== null && value !== undefined && value !== '')
  )
}

export function normalizeRequestedOverrides(payload, valueKeys) {
  if (!payload || typeof payload !== 'object') return {}
  return normalizeOverrideMap(payload, valueKeys)
}

async function readSheet(sheetName) {
  return loadSheetRows(config.inputExcel, sheetName)
}

async function loadWatchlistFromFile(limit = null) {
  const rows = await readSheet(config.watchlistSheet)
  const tickers = rows
    .map((row) => toFyersTicker(row[config.symbolCol]))
    .filter(Boolean)
  const unique = [...new Set(tickers)]
  return limit ? unique.slice(0, limit) : unique
}

function loadWatchlistFromEnv(limit = null) {
  return normalizeRequestedWatchlist(config.watchlistSymbols, limit)
}

async function loadSectorOverridesFromFile() {
  const rows = await readSheet(config.sectorSheet)
  return Object.fromEntries(
    rows
      .map((row) => [String(row[config.sectorSymbolCol] || '').trim().toUpperCase(), row[config.sectorCol]])
      .filter(([symbol, sector]) => symbol && sector)
  )
}

async function loadDeliveryOverridesFromFile() {
  const rows = await readSheet(config.deliverySheet)
  return Object.fromEntries(
    rows
      .map((row) => [String(row[config.deliverySymbolCol] || '').trim().toUpperCase(), row[config.deliveryPctCol]])
      .filter(([symbol]) => symbol)
  )
}

export async function loadWatchlist(limit = null) {
  if (config.watchlistSymbols.length) {
    return loadWatchlistFromEnv(limit)
  }

  if (config.watchlistApiUrl) {
    try {
      const payload = await fetchJson(config.watchlistApiUrl, 'Watchlist API')
      const tickers = normalizeWatchlistRows(extractWatchlistRows(payload))
      if (tickers.length) {
        return limit ? tickers.slice(0, limit) : tickers
      }
    } catch {
    }
  }

  return loadWatchlistFromFile(limit)
}

export async function loadSectorOverrides() {
  if (Object.keys(config.sectorOverridesJson).length) {
    return normalizeOverrideMap(config.sectorOverridesJson, ['sector', 'Sector', 'value', 'Value'])
  }

  if (config.sectorOverridesApiUrl) {
    const payload = await fetchJson(config.sectorOverridesApiUrl, 'Sector overrides API')
    return normalizeOverrideMap(payload, ['sector', 'Sector', 'value', 'Value'])
  }

  return loadSectorOverridesFromFile()
}

export async function loadDeliveryOverrides() {
  if (Object.keys(config.deliveryOverridesJson).length) {
    return normalizeOverrideMap(config.deliveryOverridesJson, ['deliveryPct', 'DeliveryPct', 'delivery', 'Delivery', 'value', 'Value'])
  }

  if (config.deliveryOverridesApiUrl) {
    const payload = await fetchJson(config.deliveryOverridesApiUrl, 'Delivery overrides API')
    return normalizeOverrideMap(payload, ['deliveryPct', 'DeliveryPct', 'delivery', 'Delivery', 'value', 'Value'])
  }

  return loadDeliveryOverridesFromFile()
}