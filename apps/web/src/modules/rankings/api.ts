import { t } from '@/i18n'
import { pb } from '@/shared/api/pocketbase'
import { AppError } from '@/shared/api/errors'
import type {
  CategoryRecord,
  CompetitionDayRecord,
  GameRecord,
  GameStatus,
  RankingSnapshotRecord,
  RoundRecord,
  TeamRecord,
} from '@/shared/types/records'

const byCategory = (category: string) => pb.filter('category = {:category}', { category })

export function listRounds(categoryId: string) {
  return pb
    .collection<RoundRecord>('rounds')
    .getFullList({ filter: byCategory(categoryId), sort: 'position,key' })
}

type RoundInput = Pick<
  RoundRecord,
  'key' | 'name' | 'position' | 'testing_minutes' | 'scoring_minutes' | 'day' | 'game_rule'
> &
  Pick<Partial<RoundRecord>, 'check_mode'>

/** Competition days of an event (a round can be assigned to one, M5-02). */
export function listEventDays(eventId: string) {
  return pb.collection<CompetitionDayRecord>('competition_days').getFullList({
    filter: pb.filter('event = {:event}', { event: eventId }),
    sort: 'date',
  })
}

export function createRound(categoryId: string, data: RoundInput) {
  return pb.collection<RoundRecord>('rounds').create({ ...data, category: categoryId })
}

export function updateRound(id: string, data: RoundInput) {
  return pb.collection<RoundRecord>('rounds').update(id, data)
}

export function deleteRound(id: string) {
  return pb.collection('rounds').delete(id)
}

/** The scoring phase of a round: its day and start place the round in the planner. */
export interface ScoringPhaseVersion {
  id: string
  day: string
  /** HH:MM, or "" when not timed. */
  starts_at: string
  updated: string
}

export async function getScoringPhase(roundId: string): Promise<ScoringPhaseVersion | undefined> {
  const found = await pb.collection('round_phases').getList<ScoringPhaseVersion>(1, 1, {
    filter: pb.filter('round = {:round} && phase = "scoring"', { round: roundId }),
    fields: 'id,day,starts_at,updated',
  })
  return found.items[0]
}

/**
 * M11-05: times a round from its form, exactly as moving its scoring phase in the planner
 * (M4-14) would: the update carries a version and gets the planner's 409 and validation errors.
 * Call after saving the round. Saving the round may itself move the phase (its day and duration
 * follow the round), so the phase is read again; a start that differs from the one the form
 * showed (`read`) was changed in the planner meanwhile and is reported as a conflict.
 */
export async function timeRound(
  roundId: string,
  startsAt: string,
  read?: Pick<ScoringPhaseVersion, 'starts_at'>,
) {
  const phase = await getScoringPhase(roundId)
  if (!phase) throw new AppError('not_found', t('errors.kind.not_found'))
  if (read && phase.starts_at !== read.starts_at) {
    throw new AppError('conflict', t('server.changed_meanwhile'), { status: 409 })
  }
  return pb.collection('round_phases').update<ScoringPhaseVersion>(phase.id, {
    starts_at: startsAt,
    expected_updated: phase.updated,
  })
}

export function listApprovedTeams(categoryId: string) {
  return pb.collection<TeamRecord>('teams').getFullList({
    filter: pb.filter('category = {:category} && status = "approved"', { category: categoryId }),
    sort: 'name',
  })
}

/**
 * Games of a category. Filters by the team's category, which equals the round's category (M3-02):
 * filtering through `round` together with the games access rule made the query take seconds.
 */
export function listGames(categoryId: string) {
  return pb.collection<GameRecord>('games').getFullList({
    filter: pb.filter('team.category = {:category}', { category: categoryId }),
    sort: 'attempt',
  })
}

export interface GameInputData {
  round: string
  team: string
  attempt: number
  status: GameStatus
  points?: number
  time_ms?: number
  ruleset?: string
  values?: Record<string, unknown> | null
  /** Version the edit was based on; an outdated one is refused (409). */
  expected_updated?: string
}

export function saveGame(id: string | undefined, data: GameInputData) {
  return id
    ? pb.collection<GameRecord>('games').update(id, data)
    : pb.collection<GameRecord>('games').create(data)
}

export function deleteGame(id: string) {
  return pb.collection('games').delete(id)
}

/** Saved ranking configurations are validated by the server (ranking engine). */
export function saveRankingConfig(categoryId: string, ranking: unknown) {
  return pb.collection<CategoryRecord>('categories').update(categoryId, { ranking })
}

export function listSnapshots(categoryId: string) {
  return pb.collection<RankingSnapshotRecord>('ranking_snapshots').getFullList({
    filter: byCategory(categoryId),
    sort: '-created',
  })
}

/** Computes the ranking on the server from the stored results and preserves it (M3-17). */
export function createSnapshot(categoryId: string, title: string) {
  return pb.send<RankingSnapshotRecord>(`/api/categories/${categoryId}/ranking/snapshots`, {
    method: 'POST',
    body: { title },
  })
}
