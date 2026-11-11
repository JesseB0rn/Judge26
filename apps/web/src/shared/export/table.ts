// Tabular exports (M7-05, M7-06). Feature modules describe their data as an ExportTable; the
// CSV and XLSX writers turn it into files. See docs/specifications/M7-exports.md.

/**
 * - text: as is
 * - number: `decimals` fixes the displayed decimal places in spreadsheets
 * - duration: milliseconds, written as seconds with 3 decimals (as shown in the app); name the
 *   column accordingly, e.g. "Time (s)"
 * - date / datetime: ISO or PocketBase date strings, shown in local time
 */
export type ColumnType = 'text' | 'number' | 'duration' | 'date' | 'datetime'

export interface ExportColumn {
  header: string
  type?: ColumnType
  decimals?: number
  /** Spreadsheet column width in characters. Default: from the content. */
  width?: number
}

export type Cell = string | number | null | undefined

export interface ExportTable {
  /** Sheet name (XLSX). */
  name: string
  columns: ExportColumn[]
  rows: Cell[][]
}

/** Parses an ISO or PocketBase ("2026-06-01 08:00:00.000Z") date; undefined if invalid. */
export function parseDate(value: Cell): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined
  // A plain calendar date is a local day, not UTC midnight.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = day
    ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    : new Date(value.replace(' ', 'T'))
  return isNaN(date.getTime()) ? undefined : date
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatLocalDateTime(date: Date): string {
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** File-name friendly version of a title ("RoboMission Junior – Day 1" → "robomission-junior-day-1"). */
export function slug(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'export'
  )
}
