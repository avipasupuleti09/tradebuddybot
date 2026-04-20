import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')
const preferredDataDir = path.join(rootDir, 'data')
const legacyDataDir = path.join(rootDir, 'data')
const cacheDir = path.join(rootDir, '.cache')

function readBooleanEnv(name, fallback = false) {
  const value = process.env[name]
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function readListEnv(name) {
  const value = process.env[name]
  if (!value) return []
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readJsonEnv(name, fallback = {}) {
  const value = process.env[name]
  if (!value) return fallback

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function ensurePreferredDataDir() {
  if (!fs.existsSync(preferredDataDir)) {
    fs.mkdirSync(preferredDataDir, { recursive: true })
  }

  const preferredHasFiles = fs.existsSync(preferredDataDir) && fs.readdirSync(preferredDataDir).length > 0
  const legacyHasFiles = fs.existsSync(legacyDataDir) && fs.readdirSync(legacyDataDir).length > 0

  if (!preferredHasFiles && legacyHasFiles) {
    fs.cpSync(legacyDataDir, preferredDataDir, { recursive: true })
  }

  return fs.existsSync(preferredDataDir) && fs.readdirSync(preferredDataDir).length > 0 ? preferredDataDir : legacyDataDir
}

const dataDir = ensurePreferredDataDir()

export default {
  rootDir,
  dataDir,
  cacheDir,
  dataSourceMode: process.env.DATA_SOURCE_MODE || 'api',
  bootstrapScanOnRequest: readBooleanEnv('BOOTSTRAP_SCAN_ON_REQUEST', true),
  persistWorkbook: readBooleanEnv('PERSIST_WORKBOOK', false),
  watchlistSymbols: readListEnv('WATCHLIST_SYMBOLS'),
  watchlistApiUrl: process.env.WATCHLIST_API_URL || '',
  sectorOverridesJson: readJsonEnv('SECTOR_OVERRIDES_JSON'),
  sectorOverridesApiUrl: process.env.SECTOR_OVERRIDES_API_URL || '',
  deliveryOverridesJson: readJsonEnv('DELIVERY_OVERRIDES_JSON'),
  deliveryOverridesApiUrl: process.env.DELIVERY_OVERRIDES_API_URL || '',
  inputExcel: path.join(dataDir, 'watchlist.xlsx'),
  outputExcel: path.join(dataDir, 'NSE_SCANNER_OUTPUT.xlsx'),
  watchlistSheet: 'Watchlist',
  symbolCol: 'Symbol',
  sectorSheet: 'Sectors',
  sectorSymbolCol: 'Symbol',
  sectorCol: 'Sector',
  deliverySheet: 'Delivery',
  deliverySymbolCol: 'Symbol',
  deliveryPctCol: 'DeliveryPct',
  flaskApiBase: process.env.FLASK_API_BASE || 'http://localhost:5000',
  benchmark: 'NSE:NIFTY50-INDEX',
