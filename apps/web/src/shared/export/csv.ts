import {
  formatLocalDate,
  formatLocalDateTime,
  parseDate,
  type Cell,
  type ExportColumn,
  type ExportTable,
} from './table'

// RFC 4180 CSV (M7-05): comma separated, CRLF line ends, UTF-8 with a byte order mark so Excel
// detects the encoding. Numbers use "." as decimal separator and are not rounded.

/** Spreadsheet programs run cells starting with these as formulas (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/

function text(value: Cell, column: ExportColumn): string {
  if (value === null || value === undefined || value === '') return ''
  switch (column.type) {
    case 'number':
      return String(value)
    case 'duration':
      return typeof value === 'number' ? (value / 1000).toFixed(3) : ''
    case 'date': {
      const date = parseDate(value)
      return date ? formatLocalDate(date) : ''
    }
    case 'datetime': {
      const date = parseDate(value)
      return date ? formatLocalDateTime(date) : ''
    }
    default: {
      const s = String(value)
      return FORMULA_START.test(s) ? `'${s}` : s
    }
  }
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(table: ExportTable): string {
  const lines = [table.columns.map((c) => quote(c.header))]
  for (const row of table.rows) {
    lines.push(table.columns.map((c, i) => quote(text(row[i], c))))
  }
  return lines.map((l) => l.join(',')).join('\r\n') + '\r\n'
}

export function csvBlob(table: ExportTable): Blob {
  return new Blob(['﻿', toCsv(table)], { type: 'text/csv;charset=utf-8' })
}
