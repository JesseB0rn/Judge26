import { pb } from '@/shared/api/pocketbase'
import type {
  CategoryRecord,
  CompetitionDayRecord,
  GameRuleRecord,
  RoundRecord,
  RulesetRecord,
} from '@/shared/types/records'

export type CategoryInput = Pick<
  CategoryRecord,
  | 'name'
  | 'code'
  | 'description'
  | 'min_age'
  | 'max_age'
  | 'min_team_size'
  | 'max_team_size'
  | 'max_teams'
>

const categories = () => pb.collection<CategoryRecord>('categories')

export function listEventCategories(eventId: string) {
  return categories().getFullList({
    filter: pb.filter('event = {:event}', { event: eventId }),
    sort: 'code',
  })
}

/** Templates are categories without an event. */
export function listTemplates() {
  return categories().getFullList({ filter: 'event = ""', sort: 'code' })
}

export function createCategory(eventId: string, data: CategoryInput) {
  return categories().create({ ...data, event: eventId })
}

export function updateCategory(id: string, data: Partial<CategoryInput>) {
  return categories().update(id, data)
}

export function deleteCategory(id: string) {
  return categories().delete(id)
}

/** Creates an independent copy (M1-09). An empty `event` copies into the template library. */
export function copyCategory(id: string, target: { event?: string; name?: string; code?: string }) {
  return pb.send<CategoryRecord>(`/api/categories/${id}/copy`, { method: 'POST', body: target })
}

// --- Categories grid (M11-01, M11-03) ------------------------------------------------
// A fixed number of requests, whatever the number of categories.

const byEvent = (expr: string, eventId: string) =>
  pb.filter(`${expr} = {:event}`, { event: eventId })

/** Rounds of all categories of an event, by category and position. */
export function listEventRounds(eventId: string) {
  return pb
    .collection<RoundRecord>('rounds')
    .getFullList({ filter: byEvent('category.event', eventId), sort: 'category,position,key' })
}

/** The scoring phase of each round of an event: its day and start time place the round. */
export interface ScoringPhase {
  id: string
  round: string
  day: string
  starts_at: string
  updated: string
}

export function listEventScoringPhases(eventId: string) {
  return pb.collection('round_phases').getFullList<ScoringPhase>({
    filter: pb.filter('round.category.event = {:event} && phase = "scoring"', { event: eventId }),
    fields: 'id,round,day,starts_at,updated',
  })
}

export function listEventGameRules(eventId: string) {
  return pb
    .collection<GameRuleRecord>('game_rules')
    .getFullList({ filter: byEvent('category.event', eventId), sort: 'position,key' })
}

/** Ruleset versions of an event without their definitions: only what the state needs. */
export type RulesetState = Pick<RulesetRecord, 'id' | 'category' | 'game_rule' | 'status'>

export function listEventRulesetStates(eventId: string) {
  return pb.collection('rulesets').getFullList<RulesetState>({
    filter: byEvent('category.event', eventId),
    fields: 'id,category,game_rule,status',
  })
}

export function listEventDays(eventId: string) {
  return pb
    .collection<CompetitionDayRecord>('competition_days')
    .getFullList({ filter: byEvent('event', eventId), sort: 'date' })
}
