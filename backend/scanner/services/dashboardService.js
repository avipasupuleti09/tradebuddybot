import config from './config.js'
import { runFullScan } from './scannerService.js'
import { buildClientScannerPayloadFromSheetRows } from '../../shared/scanner-core/index.js'

let latestSheetRows = null

export function cacheDashboardSheets(sheetRows) {
  latestSheetRows = Object.fromEntries(
    Object.entries(sheetRows || {}).map(([sheetName, rows]) => [sheetName, Array.isArray(rows) ? rows : []])
  )
}

export function buildDashboardPayloadFromSheets(sheetRows, limit = null) {
  const payload = buildClientScannerPayloadFromSheetRows(sheetRows, limit)
  const dataReady = (sheetRows.All_Ranked || []).length > 0

  return {
    overview: payload.overview,
    datasets: payload.datasets,
    meta: {
      workbookAvailable: dataReady,
      dataReady,
      dataSourceMode: config.dataSourceMode,
      persistWorkbook: config.persistWorkbook,
      outputExcel: config.outputExcel,
      generatedAt: new Date().toISOString(),
    },
  }
}

export async function getDashboardPayload(limit = null) {
  if (!latestSheetRows && config.bootstrapScanOnRequest) {
    cacheDashboardSheets(await runFullScan(null))
  }

  return buildDashboardPayloadFromSheets(latestSheetRows || {}, limit)
}
