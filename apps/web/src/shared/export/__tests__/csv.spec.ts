import { describe, expect, it } from 'vitest'
import { csvBlob, toCsv } from '../csv'
import type { ExportTable } from '../table'

const table = (rows: ExportTable['rows'], columns: ExportTable['columns']): ExportTable => ({
  name: 'Test',
  columns,
  rows,
})

describe('CSV export (M7-05)', () => {
  it('writes a header and rows with CRLF line ends', () => {
    expect(
      toCsv(table([['Bots', 120]], [{ header: 'Team' }, { header: 'Points', type: 'number' }])),
    ).toBe('Team,Points\r\nBots,120\r\n')
  })

  it('quotes separators, quotes and line breaks', () => {
    const csv = toCsv(table([['Bots, "the best"\nteam']], [{ header: 'Team' }]))
    expect(csv).toBe('Team\r\n"Bots, ""the best""\nteam"\r\n')
  })

  it('keeps numbers exact and writes durations in seconds', () => {
    const csv = toCsv(
      table(
        [[87.25, 83456, 0.1 + 0.2]],
        [
          { header: 'Points', type: 'number', decimals: 0 },
          { header: 'Time (s)', type: 'duration' },
          { header: 'Raw', type: 'number' },
        ],
      ),
    )
    expect(csv.split('\r\n')[1]).toBe('87.25,83.456,0.30000000000000004')
  })

  it('writes empty cells for missing values', () => {
    const csv = toCsv(
      table(
        [[null, undefined, '', null]],
        [
          { header: 'a' },
          { header: 'b', type: 'number' },
          { header: 'c' },
          { header: 'd', type: 'duration' },
        ],
      ),
    )
    expect(csv.split('\r\n')[1]).toBe(',,,')
  })

  it('writes dates in local time', () => {
    const local = new Date(2026, 5, 1, 9, 5)
    const csv = toCsv(
      table(
        [[local.toISOString(), '2026-06-01', 'not a date']],
        [
          { header: 'At', type: 'datetime' },
          { header: 'Day', type: 'date' },
          { header: 'Bad', type: 'date' },
        ],
      ),
    )
    expect(csv.split('\r\n')[1]).toBe('2026-06-01 09:05,2026-06-01,')
  })

  it('neutralizes cells that spreadsheets would run as formulas', () => {
    const csv = toCsv(
      table(
        [['=HYPERLINK("http://x")'], ['+1'], ['@SUM(A1)'], ['-2'], ['Team -2']],
        [{ header: 'Team' }],
      ),
    )
    expect(csv.split('\r\n').slice(1, 6)).toEqual([
      `"'=HYPERLINK(""http://x"")"`,
      "'+1",
      "'@SUM(A1)",
      "'-2",
      'Team -2',
    ])
  })

  it('starts the file with a UTF-8 byte order mark', async () => {
    const blob = csvBlob(table([['Zürich']], [{ header: 'Team' }]))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Team\r\nZürich\r\n')
    expect(blob.type).toBe('text/csv;charset=utf-8')
  })
})
