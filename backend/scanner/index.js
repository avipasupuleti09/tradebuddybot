import express from 'express'
import cors from 'cors'
import { pathToFileURL } from 'node:url'
import config from './services/config.js'
import { getDashboardPayload, buildDashboardPayloadFromSheets, cacheDashboardSheets } from './services/dashboardService.js'
import { getLiveSnapshot, runFullScan } from './services/scannerService.js'

function parseLimit(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseScanRequest(body) {
  return {
    watchlistSymbols: Array.isArray(body?.watchlistSymbols) ? body.watchlistSymbols : body?.watchlistSymbols,
    sectorOverrides: body?.sectorOverrides && typeof body.sectorOverrides === 'object' ? body.sectorOverrides : undefined,
    deliveryOverrides: body?.deliveryOverrides && typeof body.deliveryOverrides === 'object' ? body.deliveryOverrides : undefined,
  }
}

export function createScannerApp() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'ai-stock-backend',
      dataSourceMode: config.dataSourceMode,
      persistWorkbook: config.persistWorkbook,
      watchlistEnvConfigured: config.watchlistSymbols.length > 0,
      watchlistApiConfigured: Boolean(config.watchlistApiUrl),
      sectorOverridesInlineConfigured: Object.keys(config.sectorOverridesJson).length > 0,
      sectorOverridesApiConfigured: Boolean(config.sectorOverridesApiUrl),
      deliveryOverridesInlineConfigured: Object.keys(config.deliveryOverridesJson).length > 0,
      deliveryOverridesApiConfigured: Boolean(config.deliveryOverridesApiUrl),
      outputExcel: config.outputExcel,
    })
  })

  app.get('/api/dashboard', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, 300)
      res.json(await getDashboardPayload(limit))
    } catch (error) {
      res.status(500).send(error.message || 'Failed to load dashboard')
    }
  })

  app.post('/api/scan/run', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, null)
      const datasets = await runFullScan(limit, parseScanRequest(req.body))
      cacheDashboardSheets(datasets)
      res.json(buildDashboardPayloadFromSheets(datasets, limit))
    } catch (error) {
      res.status(500).send(error.message || 'Failed to run scan')
    }
  })

  async function handleLiveRequest(req, res) {
    try {
      const limit = parseLimit(req.query.limit, config.liveScannerTickerLimit)
      const rows = await getLiveSnapshot(limit, parseScanRequest(req.body))
      res.json({ rows: rows.slice(0, limit), generatedAt: new Date().toISOString() })
    } catch (error) {
      res.status(500).send(error.message || 'Failed to load live market data')
    }
  }

  app.get('/api/live', handleLiveRequest)
  app.post('/api/live', handleLiveRequest)

  return app
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  const port = Number(process.env.SCANNER_PORT || 8001)
  const app = createScannerApp()
  app.listen(port, () => {
    console.log(`Scanner backend listening on http://localhost:${port}`)
  })
}