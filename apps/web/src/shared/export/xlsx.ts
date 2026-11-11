import { strToU8, zipSync, type Zippable } from 'fflate'
import { parseDate, type Cell, type ExportColumn, type ExportTable } from './table'

// Minimal Office Open XML spreadsheet writer (M7-06): one sheet per table, a bold header row that
// stays visible (frozen) with filters, column widths, and typed cells: numbers with fixed
// decimals, durations in seconds (0.000), dates and date-times as real dates. Strings are inline (no
// shared string table), which every spreadsheet program reads.

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const DAY_MS = 86_400_000
/** Days between 1899-12-30 (Excel's day 0) and 1970-01-01. */
const EPOCH_OFFSET = 25_569

/** Custom number formats get ids from 164 on. */
const FORMATS = {
  duration: '0.000',
  date: 'yyyy-mm-dd',
  datetime: 'yyyy-mm-dd hh:mm',
}

function escapeXml(value: string): string {
  return (
    value
      // Characters not allowed in XML 1.0.
      // oxlint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

/** Excel date serial of a local date-time (spreadsheets have no time zones). */
export function excelDate(date: Date): number {
  const local = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  )
  return local / DAY_MS + EPOCH_OFFSET
}

/** Sheet names: at most 31 characters, none of []:*?/\, unique within the workbook. */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((raw) => {
    const base =
      raw
        .replace(/[[\]:*?/\\]/g, ' ')
        .trim()
        .slice(0, 31) || 'Sheet'
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      const suffix = ` (${i})`
      name = base.slice(0, 31 - suffix.length) + suffix
    }
    used.add(name.toLowerCase())
    return name
  })
}

/** Cell styles shared by all sheets: 0 default, 1 header, then one per number format. */
class Styles {
  private formats: string[] = []
  private xfs: { numFmtId: number }[] = []

  /** Style index for a column's cells. */
  styleFor(column: ExportColumn): number {
    const type = column.type ?? 'text'
    if (type === 'text') return 0
    if (type === 'number' && column.decimals === undefined) return 0
    const code =
      type === 'number'
        ? column.decimals === 0
          ? '0'
          : `0.${'0'.repeat(column.decimals!)}`
        : FORMATS[type]
    let fmt = this.formats.indexOf(code)
    if (fmt === -1) fmt = this.formats.push(code) - 1
    const numFmtId = 164 + fmt
    let xf = this.xfs.findIndex((x) => x.numFmtId === numFmtId)
    if (xf === -1) xf = this.xfs.push({ numFmtId }) - 1
    return 2 + xf
  }

  xml(): string {
    const numFmts = this.formats
      .map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escapeXml(code)}"/>`)
      .join('')
    const xfs = this.xfs
      .map(
        (x) =>
          `<xf numFmtId="${x.numFmtId}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`,
      )
      .join('')
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts ? `<numFmts count="${this.formats.length}">${numFmts}</numFmts>` : '') +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${2 + this.xfs.length}">` +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      xfs.replace(/<xf /g, '<xf xfId="0" ') +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    )
  }
}

function numericValue(value: Cell, column: ExportColumn): number | undefined {
  switch (column.type) {
    case 'number':
      return typeof value === 'number' && isFinite(value) ? value : undefined
    case 'duration':
      return typeof value === 'number' && isFinite(value) ? value / 1000 : undefined
    case 'date':
    case 'datetime': {
      const date = parseDate(value)
      return date ? excelDate(date) : undefined
    }
    default:
      return undefined
  }
}

function cellXml(ref: string, value: Cell, column: ExportColumn, style: number): string {
  if (value === null || value === undefined || value === '') return ''
  const s = style ? ` s="${style}"` : ''
  const n = numericValue(value, column)
  if (n !== undefined) return `<c r="${ref}"${s}><v>${n}</v></c>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`
}

function displayLength(value: Cell, column: ExportColumn): number {
  if (value === null || value === undefined) return 0
  if (column.type === 'duration') return 8
  if (column.type === 'date') return 10
  if (column.type === 'datetime') return 16
  return String(value).length
}

function sheetXml(table: ExportTable, styles: Styles): string {
  const columnStyles = table.columns.map((c) => styles.styleFor(c))
  const widths = table.columns.map((c, i) => {
    if (c.width) return c.width
    const longest = Math.max(
      c.header.length,
      ...table.rows.slice(0, 500).map((r) => displayLength(r[i], c)),
    )
    return Math.min(60, Math.max(8, longest + 2))
  })
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('')
  const header = table.columns
    .map((c, i) => cellXml(`${columnName(i)}1`, c.header, { header: c.header }, 1))
    .join('')
  const rows = table.rows
    .map((row, r) => {
      const cells = table.columns
        .map((c, i) => cellXml(`${columnName(i)}${r + 2}`, row[i], c, columnStyles[i]!))
        .join('')
      return `<row r="${r + 2}">${cells}</row>`
    })
    .join('')
  const last = `${columnName(Math.max(0, table.columns.length - 1))}`
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData><row r="1">${header}</row>${rows}</sheetData>` +
    (table.columns.length ? `<autoFilter ref="A1:${last}${table.rows.length + 1}"/>` : '') +
    '</worksheet>'
  )
}

/** Builds an .xlsx file with one sheet per table. */
export function toXlsx(tables: ExportTable[]): Uint8Array {
  const styles = new Styles()
  const names = sheetNames(tables.map((t) => t.name))
  const sheets = tables.map((t) => sheetXml(t, styles))
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        names
          .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('') +
        '</sheets>' +
        // Filters need a defined name per sheet in Excel.
        '<definedNames>' +
        tables
          .map((t, i) =>
            t.columns.length
              ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(names[i]!.replace(/'/g, "''"))}'!$A$1:$${columnName(t.columns.length - 1)}$${t.rows.length + 1}</definedName>`
              : '',
          )
          .join('') +
        '</definedNames>' +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(styles.xml()),
  }
  sheets.forEach((xml, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml)))
  // fflate tells files from folders with `instanceof Uint8Array`; TextEncoder output can come
  // from another realm (e.g. jsdom in tests), so copy into this realm's Uint8Array.
  const entries: Zippable = {}
  for (const [path, data] of Object.entries(files)) entries[path] = new Uint8Array(data)
  return zipSync(entries, { level: 6 })
}

export function xlsxBlob(tables: ExportTable[]): Blob {
  return new Blob([toXlsx(tables) as BlobPart], { type: XLSX_TYPE })
}
