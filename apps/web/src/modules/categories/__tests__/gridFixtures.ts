import { makeCategory } from '@/test/utils'
import type { CompetitionDayRecord, GameRuleRecord, RoundRecord } from '@/shared/types/records'
import type { RulesetState, ScoringPhase } from '../api'

// Records for the categories grid tests (M11).

const base = { collectionId: '', collectionName: '', created: '', updated: '' }

export const rme = makeCategory({ id: 'rme', code: 'RM-E', name: 'Elementary' })
export const rmj = makeCategory({ id: 'rmj', code: 'RM-J', name: 'Junior' })
export const rms = makeCategory({ id: 'rms', code: 'RM-S', name: 'Senior' })

export function round(
  category: string,
  key: string,
  position: number,
  extra: Partial<RoundRecord> = {},
): RoundRecord {
  return {
    ...base,
    id: `${category}-${key}`,
    category,
    key,
    name: `Run ${position}`,
    position,
    testing_minutes: 0,
    scoring_minutes: 15,
    check_mode: 'synchronous',
    ...extra,
  }
}

export function game(category: string, key: string, position = 1): GameRuleRecord {
  return {
    ...base,
    id: `${category}-g${key}`,
    category,
    key,
    name: `Game ${key}`,
    description: '',
    position,
  }
}

export const ruleset = (gameRule: GameRuleRecord, status: 'draft' | 'published'): RulesetState => ({
  id: `${gameRule.id}-${status}`,
  category: gameRule.category,
  game_rule: gameRule.id,
  status,
})

export const sat: CompetitionDayRecord = {
  ...base,
  id: 'sat',
  event: 'event1',
  date: '2026-06-13',
  label: '',
}
export const sun: CompetitionDayRecord = {
  ...base,
  id: 'sun',
  event: 'event1',
  date: '2026-06-14',
  label: '',
}

export const phase = (r: RoundRecord, day: string, startsAt: string): ScoringPhase => ({
  id: `${r.id}-scoring`,
  round: r.id,
  day,
  starts_at: startsAt,
  updated: '2026-01-01 00:00:00.000Z',
})
