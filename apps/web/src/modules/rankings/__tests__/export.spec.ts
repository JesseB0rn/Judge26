import { describe, expect, it } from 'vitest'
import { EXAMPLE_RANKING_CONFIG, rank } from '@judge26/ranking-engine'
import { toCsv } from '@/shared/export/csv'
import { toXlsx } from '@/shared/export/xlsx'
import { readXlsx } from '@/test/xlsx'
import { makeGame, makeRound, makeTeam } from '@/test/utils'
import { rankingTable, resultsTable, type RankingExport } from '../export'
import { parseRankingConfig, toTeamInputs } from '../lib'

const rounds = [makeRound('R1', 1), makeRound('R2', 2), makeRound('R3', 3)]
const teams = [
  makeTeam({ id: 'alpha', name: 'Alpha', organization: 'School A', country: 'CH' }),
  makeTeam({ id: 'bravo', name: 'Bravo, "B"', organization: 'School B', country: 'DE' }),
  makeTeam({ id: 'charlie', name: 'Charlie', organization: '', country: '' }),
]
const game = (team: string, round: string, points: number, time: number, status = 'completed') =>
  makeGame({ team, round: `round-${round}`, points, time_ms: time, status: status as 'completed' })
const games = [
  game('alpha', 'R1', 100, 60_000),
  game('alpha', 'R2', 120, 55_000),
  game('alpha', 'R3', 0, 0, 'absent'),
  game('bravo', 'R1', 120, 50_000),
  game('bravo', 'R2', 80, 40_000),
  game('bravo', 'R3', 120, 50_000),
]

function context(): RankingExport {
  const config = parseRankingConfig(JSON.stringify(EXAMPLE_RANKING_CONFIG)).config!
  const inputs = toTeamInputs(teams, games, rounds)
  return { ranking: rank(config, inputs), config: EXAMPLE_RANKING_CONFIG, inputs, teams, rounds }
}

describe('ranking export', () => {
  it('M7-T04: exports the ranking to CSV with the correct data and values', () => {
    const lines = toCsv(rankingTable(context())).trimEnd().split('\r\n')
    expect(lines).toEqual([
      'Rank,Shared,Team,Organization,Country,Best,Time of best (s),Total,' +
        'Round 1 points,Round 1 time (s),Round 1 status,Round 2 points,Round 2 time (s),Round 2 status,' +
        'Round 3 points,Round 3 time (s),Round 3 status,Provisional,Decided by',
      '1,,"Bravo, ""B""",School B,DE,120,50.000,320,120,50.000,,80,40.000,,120,50.000,,,',
      '2,,Alpha,School A,CH,120,55.000,220,100,60.000,,120,55.000,,0,,absent,,Time of best',
      '3,,Charlie,,,0,,0,0,,missing,0,,missing,0,,missing,yes,Best',
    ])
  })

  it('exports every result the ranking was computed from', () => {
    const lines = toCsv(resultsTable(context())).trimEnd().split('\r\n')
    expect(lines).toEqual([
      'Team,Round,Attempt,Status,Points,Time (s)',
      'Alpha,Round 1,1,Completed,100,60.000',
      'Alpha,Round 2,1,Completed,120,55.000',
      'Alpha,Round 3,1,Absent,,',
      '"Bravo, ""B""",Round 1,1,Completed,120,50.000',
      '"Bravo, ""B""",Round 2,1,Completed,80,40.000',
      '"Bravo, ""B""",Round 3,1,Completed,120,50.000',
    ])
  })

  it('M7-T05: exports the ranking to XLSX with the correct columns and formatting', () => {
    const data = context()
    const parts = readXlsx(toXlsx([rankingTable(data), resultsTable(data)]))
    expect(parts['xl/workbook.xml']).toContain('name="Ranking"')
    expect(parts['xl/workbook.xml']).toContain('name="Results"')
    const sheet = parts['xl/worksheets/sheet1.xml']!
    const headers = [...sheet.matchAll(/<c r="([A-Z]+)1" s="1"[^>]*><is><t[^>]*>([^<]*)</g)].map(
      (m) => `${m[1]}:${m[2]}`,
    )
    expect(headers.slice(0, 8)).toEqual([
      'A:Rank',
      'B:Shared',
      'C:Team',
      'D:Organization',
      'E:Country',
      'F:Best',
      'G:Time of best (s)',
      'H:Total',
    ])
    // Precision 0 → whole-number points; times as seconds with 3 decimals.
    const styles = parts['xl/styles.xml']!
    const formatOf = (ref: string) => {
      const style = Number(new RegExp(`<c r="${ref}" s="(\\d+)"`).exec(sheet)![1])
      const xf = [...styles.matchAll(/<xf [^>]*numFmtId="(\d+)"[^>]*\/>/g)].slice(1)[style]!
      const id = xf[1]
      return new RegExp(`numFmtId="${id}" formatCode="([^"]+)"`).exec(styles)?.[1]
    }
    expect(formatOf('F2')).toBe('0')
    expect(formatOf('G2')).toBe('0.000')
    expect(sheet).toContain('<c r="G2" s="3"><v>50</v></c>')
    expect(sheet).toContain(
      '<c r="C2" t="inlineStr"><is><t xml:space="preserve">Bravo, &quot;B&quot;</t>',
    )
  })
})
