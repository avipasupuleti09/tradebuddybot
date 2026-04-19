import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import config from './config.js'

function normalizeCellValue(value) {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part?.text ?? '').join('')
  }
  if (value.result !== undefined) {
    return normalizeCellValue(value.result)
  }
  if (value.text !== undefined) {
    return value.text
  }
  if (value.error !== undefined) {
    return value.error
  }
  return String(value)
}

function extractHeaders(worksheet) {
  const headerRow = worksheet.getRow(1)
  const columnCount = Math.max(headerRow.cellCount, worksheet.columnCount, worksheet.actualColumnCount)
  const headers = []
  for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
    const value = normalizeCellValue(headerRow.getCell(columnIndex).value)
    headers.push(value === null ? '' : String(value).trim())
  }
  return headers
}

function uniqueKeys(rows) {
  const keys = []
  const seen = new Set()
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    })
  })
  return keys
}

export async function loadSheetRows(filePath, sheetName) {
  if (!fs.existsSync(filePath)) {
    return []
  }

  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)
    const worksheet = workbook.getWorksheet(sheetName)
    if (!worksheet || worksheet.rowCount < 1) return []

    const headers = extractHeaders(worksheet)
    if (!headers.some(Boolean)) return []

    const rows = []
    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const worksheetRow = worksheet.getRow(rowIndex)
      const row = {}
      let hasValue = false

      headers.forEach((header, index) => {
        if (!header) return
        const value = normalizeCellValue(worksheetRow.getCell(index + 1).value)
        row[header] = value
        if (value !== null && value !== '') {
          hasValue = true
        }
      })

      if (hasValue) {
        rows.push(row)
      }
    }

    return rows
  } catch {
    return []
  }
}

export async function loadWorkbookSheet(sheetName) {
  return loadSheetRows(config.outputExcel, sheetName)
}

export async function writeWorkbook(datasets) {
  const workbook = new ExcelJS.Workbook()
  Object.entries(datasets).forEach(([sheetName, rows]) => {
    const worksheet = workbook.addWorksheet(sheetName)
    const normalizedRows = Array.isArray(rows) ? rows : []
    const headers = uniqueKeys(normalizedRows)

    if (!headers.length) {
      return
    }

    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.min(Math.max(String(header).length + 2, 12), 36),
    }))
    normalizedRows.forEach((row) => {
      worksheet.addRow(Object.fromEntries(headers.map((header) => [header, row?.[header] ?? null])))
    })
  })

  fs.mkdirSync(path.dirname(config.outputExcel), { recursive: true })
  await workbook.xlsx.writeFile(config.outputExcel)
}
