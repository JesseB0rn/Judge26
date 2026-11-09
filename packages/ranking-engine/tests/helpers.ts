import {
  compileRankingConfig,
  type Calculation,
  type GameInput,
  type RankingConfig,
  type TeamInput,
} from '../src'

type Cell = number | [number, number] | 'dq' | 'absent' | GameInput[]

/** Team with results per round: points, [points, timeMs], 'dq', 'absent' or explicit games. */
export function team(id: string, results: Record<string, Cell>, name = id): TeamInput {
  const games: GameInput[] = []
  for (const [round, cell] of Object.entries(results)) {
    if (Array.isArray(cell) && typeof cell[0] === 'object') games.push(...(cell as GameInput[]))
    else if (cell === 'dq') games.push({ round, status: 'disqualified' })
    else if (cell === 'absent') games.push({ round, status: 'absent' })
    else if (Array.isArray(cell))
      games.push({
        round,
        status: 'completed',
        points: cell[0] as number,
        timeMs: cell[1] as number,
      })
    else games.push({ round, status: 'completed', points: cell as number })
  }
  return { id, name, games }
}

export const rounds = (...keys: string[]) => keys.map((key) => ({ key }))

/** Config ranking by `points` of `result` (desc), with optional further keys. */
export function config(
  roundKeys: string[],
  calculations: Calculation[],
  result: string,
  extra: Partial<RankingConfig> = {},
) {
  return compileRankingConfig({
    schemaVersion: 1,
    rounds: rounds(...roundKeys),
    calculations,
    ranking: { keys: [{ source: { calc: result }, field: 'points', order: 'desc' }] },
    ...extra,
  })
}

export const calc = (
  id: string,
  op: Calculation['op'],
  operands: string[],
  extra: Partial<Calculation> = {},
): Calculation => ({
  id,
  label: id,
  op,
  operands: operands.map((o) => (o.startsWith('R') ? { round: o } : { calc: o })),
  ...extra,
})
