import {
  formatRunTime,
  formatTime,
  validateRankingConfig,
  withTimeDecimals,
  type RankingConfig,
  type CompiledRankingConfig,
  type Issue,
  type TeamInput,
} from '@judge26/ranking-engine'
import type { GameRecord, RoundRecord, TeamRecord } from '@/shared/types/records'

/**
 * Builds ranking engine inputs from stored records. Mirrors
 * apps/backend/hooks/lib/ranking.js so previews match published snapshots.
 */
export function toTeamInputs(
  teams: TeamRecord[],
  games: GameRecord[],
  rounds: RoundRecord[],
): TeamInput[] {
  const keyById = new Map(rounds.map((r) => [r.id, r.key]))
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    games: games
      .filter((g) => g.team === team.id && g.status !== 'scheduled' && keyById.has(g.round))
      .map((g) => ({
        round: keyById.get(g.round)!,
        attempt: g.attempt || 1,
        status: g.status as 'completed' | 'disqualified' | 'absent',
        points: g.status === 'completed' ? g.points : null,
        // PocketBase stores empty numbers as 0; 0 ms means "no time recorded".
        timeMs: g.status === 'completed' && g.time_ms > 0 ? g.time_ms : null,
      })),
  }))
}

export interface ParsedConfig {
  definition?: unknown
  syntaxError?: string
  issues: Issue[]
  config?: CompiledRankingConfig
}

/**
 * Parses and validates a ranking configuration. With `timeDecimals` (the event's run time
 * precision, M10-20) the compiled configuration cuts times to it, like the server does for live
 * rankings and snapshots; `definition` stays as written (it is what gets saved).
 */
export function parseRankingConfig(text: string, timeDecimals?: number): ParsedConfig {
  if (!text.trim()) return { issues: [] }
  let definition: unknown
  try {
    definition = JSON.parse(text)
  } catch (e) {
    return { syntaxError: (e as Error).message, issues: [] }
  }
  const effective =
    timeDecimals !== undefined && definition && typeof definition === 'object'
      ? withTimeDecimals(definition as RankingConfig, timeDecimals)
      : definition
  const result = validateRankingConfig(effective)
  return result.ok
    ? { definition, issues: [], config: result.config }
    : { definition, issues: result.issues }
}

/** Seconds (as typed by a judge, e.g. "95.37") → milliseconds; empty → 0 (no time). */
export function secondsToMs(value: string | number): number {
  if (value === '' || value === null) return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0
}

/**
 * A ranking value: points as they are, times as m:ss (or seconds only with `secondsOnly`) with
 * `decimals` (M10-19).
 */
export function formatValue(
  value: number | null,
  field: 'points' | 'time',
  decimals = 3,
  secondsOnly = false,
): string {
  if (value === null) return '–'
  return field === 'time' ? formatRunTime(value, decimals, secondsOnly) : String(value)
}

export { formatTime }
