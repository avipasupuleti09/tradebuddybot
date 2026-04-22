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

function defaultBackendApiBase() {
  if (process.env.BACKEND_API_BASE) {
    return process.env.BACKEND_API_BASE
  }

  const hostedMode = process.argv.includes('--hosted')
  const port = hostedMode
    ? Number(process.env.PORT || 3000)
    : Number(process.env.BACKEND_PORT || 5000)

  return `http://127.0.0.1:${port}`
}

const dataDir = ensurePreferredDataDir()
const backendApiBase = defaultBackendApiBase()

export default {
  rootDir,
  dataDir,
  cacheDir,
  dataSourceMode: process.env.DATA_SOURCE_MODE || 'api',
  bootstrapScanOnRequest: readBooleanEnv('BOOTSTRAP_SCAN_ON_REQUEST', true),
  persistWorkbook: readBooleanEnv('PERSIST_WORKBOOK', false),
  watchlistSymbols: readListEnv('WATCHLIST_SYMBOLS'),
  watchlistApiUrl: process.env.WATCHLIST_API_URL || `${backendApiBase}/api/watchlists`,
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
  backendApiBase,
  benchmark: 'NSE:NIFTY50-INDEX',
  priceHistoryDays: 1095,
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
  pivotLeft: 3,
  pivotRight: 3,
  cmfPeriod: 20,
  obvSlopeDays: 20,
  accumScoreMin: 60,
  aiProbMin: 0.55,
  sectorLeaderboardTopN: 5,
  sectorMinStocks: 3,
  liveScannerTickerLimit: 25,
  liveScannerPeriod: '5d',
  intradayHistoryDays: 60,
  intradayInterval: '5',
  intradayHorizonBars: 12,
  intradayLabelRetPct: 0.8,
  backendApiBase,
}