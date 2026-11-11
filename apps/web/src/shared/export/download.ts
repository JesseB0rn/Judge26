import { csvBlob } from './csv'
import { formatLocalDate, slug, type ExportTable } from './table'
import { xlsxBlob } from './xlsx'

/** Offers a file for download in the browser. */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** "<title>-<date>.<ext>", e.g. "ranking-robomission-junior-2026-06-01.csv". */
export function exportFilename(title: string, extension: 'csv' | 'xlsx', today = new Date()) {
  return `${slug(title)}-${formatLocalDate(today)}.${extension}`
}

export type ExportFormat = 'csv' | 'xlsx'

/**
 * Downloads tables as CSV (the first table; CSV has a single sheet) or as an XLSX workbook with
 * one sheet per table.
 */
export function downloadTables(title: string, format: ExportFormat, tables: ExportTable[]) {
  if (format === 'csv') downloadBlob(exportFilename(title, 'csv'), csvBlob(tables[0]!))
  else downloadBlob(exportFilename(title, 'xlsx'), xlsxBlob(tables))
}
