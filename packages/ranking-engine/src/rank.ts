import { fromUnits } from '@judge26/scoring-engine'
import { compareResults, computeTeam, normalizeGames, type Value } from './compute'
import { operandId, type CompiledRankingConfig } from './validate'
import type { Issue, Ranking, RankingEntry, ResultExplanation, TeamInput } from './types'

interface Row {
  team: TeamInput
  values: Value[]
  provisional: boolean
  results: Record<string, ResultExplanation>
}

/** Code-unit comparison (locale-independent, deterministic everywhere). */
const byName = (a: TeamInput, b: TeamInput) => {
  const x = a.name.toLowerCase()
  const y = b.name.toLowerCase()
  return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Ranks teams (M3-13 … M3-15). Deterministic: the same configuration and
 * inputs always produce the same ranking.
 */
export function rank(config: CompiledRankingConfig, teams: TeamInput[]): Ranking {
  const { keys, ties = 'shared' } = config.config.ranking
  const issues: Issue[] = []

  const rows: Row[] = teams.map((team, i) => {
    const games = normalizeGames(config, team.games, issues, `teams[${i}]`)
    const computed = computeTeam(config, games)
    const results: Record<string, ResultExplanation> = {}
    for (const [id, v] of computed) results[id] = v.explanation
    return {
      team,
      values: keys.map((k) => computed.get(operandId(k.source))!),
      provisional: [...config.rounds.keys()].some((key) => computed.get(key)!.status === 'missing'),
      results,
    }
  })

  const keyValue = (row: Row, index: number) => {
    const v = row.values[index]!
    return { units: v.units, timeMs: v.timeMs }
  }
  const compareRows = (a: Row, b: Row) => {
    for (let i = 0; i < keys.length; i++) {
      const c = compareResults(keyValue(a, i), keyValue(b, i), [keys[i]!])
      if (c !== 0) return { diff: c, key: i }
    }
    return { diff: 0, key: -1 }
  }

  const unrankedPolicy = config.config.policies?.missing === 'unranked'
  const isRanked = (row: Row) => {
    const primary = row.values[0]!
    const value = keys[0]!.field === 'points' ? primary.units : primary.timeMs
    return value !== null && !(unrankedPolicy && row.provisional)
  }

  const ranked = rows
    .filter(isRanked)
    .sort((a, b) => compareRows(a, b).diff || byName(a.team, b.team))
  const unranked = rows.filter((r) => !isRanked(r)).sort((a, b) => byName(a.team, b.team))

  const output = (row: Row): Omit<RankingEntry, 'rank' | 'shared' | 'decidedBy'> => ({
    team: row.team.id,
    name: row.team.name,
    provisional: row.provisional,
    values: row.values.map((v, i) => {
      const field = keys[i]!.field
      if (field === 'time') return v.timeMs
      return v.units === null ? null : fromUnits(v.units, config.scale)
    }),
    results: row.results,
  })

  const entries: RankingEntry[] = []
  ranked.forEach((row, i) => {
    const previous = ranked[i - 1]
    const entry: RankingEntry = { ...output(row), rank: i + 1, shared: false, decidedBy: null }
    if (previous) {
      const { key } = compareRows(previous, row)
      if (key >= 0) entry.decidedBy = key
      else if (ties === 'name') entry.decidedBy = 'name'
      else {
        const prior = entries[i - 1]!
        entry.rank = prior.rank
        entry.shared = true
        prior.shared = true
      }
    }
    entries.push(entry)
  })
  for (const row of unranked)
    entries.push({ ...output(row), rank: null, shared: false, decidedBy: null })

  return {
    keys: keys.map((k) => ({
      label: k.label ?? `${operandId(k.source)} ${k.field}`,
      field: k.field,
      order: k.order,
    })),
    entries,
    issues,
  }
}

/** Results of a single team, e.g. for a calculation preview (M3-16). */
export function explainTeam(config: CompiledRankingConfig, team: TeamInput) {
  const issues: Issue[] = []
  const computed = computeTeam(config, normalizeGames(config, team.games, issues, 'team'))
  const results: Record<string, ResultExplanation> = {}
  for (const [id, v] of computed) results[id] = v.explanation
  return { results, issues }
}
