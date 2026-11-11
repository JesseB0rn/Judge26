import { describe, expect, it } from 'vitest'
import { readXlsx } from '@/test/xlsx'
import { columnName, excelDate, sheetNames, toXlsx } from '../xlsx'
import type { ExportTable } from '../table'

const ranking: ExportTable = {
  name: 'Ranking',
  columns: [
    { header: 'Rank', type: 'number', decimals: 0 },
    { header: 'Team' },
    { header: 'Total', type: 'number', decimals: 2 },
    { header: 'Time (s)', type: 'duration' },
    { header: 'Day', type: 'date' },
  ],
  rows: [
    [1, 'Bots & <Co>', 120.5, 83456, '2026-06-01'],
    [null, 'Late', null, null, null],
  ],
}

describe('XLSX export (M7-06)', () => {
  it('contains the parts of a workbook', () => {
    const parts = readXlsx(toXlsx([ranking, { ...ranking, name: 'Results' }]))
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ])
    expect(parts['xl/workbook.xml']).toContain('<sheet name="Ranking" sheetId="1" r:id="rId1"/>')
    expect(parts['xl/workbook.xml']).toContain('<sheet name="Results" sheetId="2" r:id="rId2"/>')
    expect(parts['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml')
  })

  it('writes typed cells: numbers, escaped text, durations in seconds, dates', () => {
    const sheet = readXlsx(toXlsx([ranking]))['xl/worksheets/sheet1.xml']!
    expect(sheet).toContain('<c r="A2" s="2"><v>1</v></c>')
    expect(sheet).toContain(
      '<c r="B2" t="inlineStr"><is><t xml:space="preserve">Bots &amp; &lt;Co&gt;</t></is></c>',
    )
    expect(sheet).toContain('<c r="C2" s="3"><v>120.5</v></c>')
    expect(sheet).toContain('<c r="D2" s="4"><v>83.456</v></c>')
    expect(sheet).toContain('<c r="E2" s="5"><v>46174</v></c>')
    // Missing values are empty cells.
    expect(sheet).toContain(
      '<row r="3"><c r="B3" t="inlineStr"><is><t xml:space="preserve">Late</t></is></c></row>',
    )
  })

  it('formats the header and number columns', () => {
    const parts = readXlsx(toXlsx([ranking]))
    const sheet = parts['xl/worksheets/sheet1.xml']!
    const styles = parts['xl/styles.xml']!
    // Bold, shaded header that stays visible, with filters.
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Rank</t>')
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain('<autoFilter ref="A1:E3"/>')
    expect(styles).toContain('<font><b/>')
    // Number formats: integer, 2 decimals, seconds with 3 decimals, date.
    expect(styles).toContain('<numFmt numFmtId="164" formatCode="0"/>')
    expect(styles).toContain('<numFmt numFmtId="165" formatCode="0.00"/>')
    expect(styles).toContain('<numFmt numFmtId="166" formatCode="0.000"/>')
    expect(styles).toContain('<numFmt numFmtId="167" formatCode="yyyy-mm-dd"/>')
    expect(styles).toContain('<cellXfs count="6">')
    // Widths from the content.
    expect(sheet).toMatch(/<col min="2" max="2" width="13" customWidth="1"\/>/)
  })

  it('names columns, dates and sheets like spreadsheets do', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ])
    expect(excelDate(new Date(1970, 0, 1))).toBe(25569)
    expect(excelDate(new Date(2026, 5, 1, 14, 30))).toBeCloseTo(46174.6041667, 6)
    expect(sheetNames(['Results: R1/R2?', 'A'.repeat(40), 'a'.repeat(40), ''])).toEqual([
      'Results  R1 R2',
      'A'.repeat(31),
      `${'a'.repeat(27)} (2)`,
      'Sheet',
    ])
  })

  it('drops characters XML cannot contain', () => {
    const sheet = readXlsx(
      toXlsx([{ name: 'X', columns: [{ header: 'Team' }], rows: [['Bots\u0007\u0000!']] }]),
    )['xl/worksheets/sheet1.xml']!
    expect(sheet).toContain('>Bots!</t>')
  })
})
