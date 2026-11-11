import { describe, expect, it } from 'vitest'
import { toCsv } from '@/shared/export/csv'
import { makeCategory, makeGame, makeRound, makeTable, makeTeam } from '@/test/utils'
import type {
  CompetitionDayRecord,
  RoundRecord,
  TableRecord,
  TeamRecord,
} from '@/shared/types/records'
import { gamesTable } from '../export'

describe('games export (M7-05)', () => {
  it('lists the schedule in playing order with results', () => {
    const r1: RoundRecord = { ...makeRound('R1', 1), day: 'day1' }
    const r2 = makeRound('R2', 2)
    const tA = makeTable({ id: 'tA', name: 'A', position: 1 })
    const tB = makeTable({ id: 'tB', name: 'B', position: 2 })
    const alpha = makeTeam({ id: 'alpha', name: 'Alpha' })
    const bravo = makeTeam({ id: 'bravo', name: 'Bravo' })
    const g = (
      round: RoundRecord,
      team: TeamRecord,
      table: TableRecord | null,
      sequence: number,
      extra = {},
    ) =>
      makeGame({
        round: round.id,
        team: team.id,
        table: table?.id ?? '',
        sequence,
        status: 'scheduled',
        expand: { round, team, ...(table ? { table } : {}) },
        ...extra,
      })
    const games = [
      g(r2, alpha, null, 0),
      g(r1, bravo, tB, 1, { status: 'completed', points: 95, time_ms: 61_230 }),
      g(r1, alpha, tA, 2, { status: 'absent' }),
      g(r1, bravo, tA, 1, { status: 'completed', points: 120, time_ms: 0, attempt: 2 }),
    ]
    const days = [
      { id: 'day1', date: '2026-06-01 00:00:00.000Z', label: 'Saturday' },
    ] as CompetitionDayRecord[]
    const lines = toCsv(gamesTable(games, [makeCategory({ id: 'cat1' })], days))
      .trimEnd()
      .split('\r\n')
    expect(lines).toEqual([
      'Category,Round,Attempt,Day,Table,Position,Team,Status,Points,Time (s)',
      'RoboMission Junior,Round 1,2,Saturday,A,1,Bravo,Completed,120,',
      'RoboMission Junior,Round 1,1,Saturday,A,2,Alpha,Absent,,',
      'RoboMission Junior,Round 1,1,Saturday,B,1,Bravo,Completed,95,61.230',
      'RoboMission Junior,Round 2,1,,,,Alpha,Scheduled,,',
    ])
  })
})
