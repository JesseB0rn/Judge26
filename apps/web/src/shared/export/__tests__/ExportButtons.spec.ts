import { afterEach, describe, expect, it, vi } from 'vitest'
import { buttonByText, click, mountView } from '@/test/utils'
import * as download from '../download'
import ExportButtons from '../ExportButtons.vue'
import type { ExportTable } from '../table'

vi.mock('../download', async (original) => ({
  ...(await original<typeof download>()),
  downloadTables: vi.fn<typeof download.downloadTables>(),
}))

const table: ExportTable = { name: 'Teams', columns: [{ header: 'Team' }], rows: [['Bots']] }

describe('export buttons', () => {
  afterEach(() => document.body.replaceChildren())

  it('downloads the current data as CSV or Excel', async () => {
    const tables = vi.fn<() => ExportTable[]>(() => [table])
    await mountView(ExportButtons, { props: { title: 'teams Swiss Open', tables } })
    expect(tables).not.toHaveBeenCalled()
    await click(buttonByText('CSV'))
    expect(download.downloadTables).toHaveBeenLastCalledWith('teams Swiss Open', 'csv', [table])
    await click(buttonByText('Excel'))
    expect(download.downloadTables).toHaveBeenLastCalledWith('teams Swiss Open', 'xlsx', [table])
  })

  it('names files after the title and date', () => {
    expect(
      download.exportFilename('Ranking: RoboMission Jünior', 'xlsx', new Date(2026, 5, 1)),
    ).toBe('ranking-robomission-junior-2026-06-01.xlsx')
  })

  it('downloadBlob clicks a temporary link', () => {
    const create = vi.fn<(b: Blob) => string>(() => 'blob:x')
    const revoke = vi.fn<(u: string) => void>()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    download.downloadBlob('a.csv', new Blob(['x']))
    expect(clicked).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
