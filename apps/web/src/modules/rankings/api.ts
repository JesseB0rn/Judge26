import { pb } from '@/shared/api/pocketbase'
import type {
  CategoryRecord,
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

export function createRound(
  categoryId: string,
  data: Pick<RoundRecord, 'key' | 'name' | 'position'>,
) {
  return pb.collection<RoundRecord>('rounds').create({ ...data, category: categoryId })
}

export function deleteRound(id: string) {
  return pb.collection('rounds').delete(id)
}

export function listApprovedTeams(categoryId: string) {
  return pb.collection<TeamRecord>('teams').getFullList({
    filter: pb.filter('category = {:category} && status = "approved"', { category: categoryId }),
    sort: 'name',
  })
}

export function listGames(categoryId: string) {
  return pb.collection<GameRecord>('games').getFullList({
    filter: pb.filter('round.category = {:category}', { category: categoryId }),
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
