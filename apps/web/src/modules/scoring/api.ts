import { pb } from '@/shared/api/pocketbase'
import type { CategoryRecord, GameRuleRecord, RulesetRecord } from '@/shared/types/records'

const rulesets = () => pb.collection<RulesetRecord>('rulesets')

export function getCategory(id: string) {
  return pb.collection<CategoryRecord>('categories').getOne(id, { expand: 'event' })
}

export function listRulesets(categoryId: string) {
  return rulesets().getFullList({
    filter: pb.filter('category = {:category}', { category: categoryId }),
    sort: '-version',
  })
}

/** Creates a draft version. Without a game rule, the server uses the category's only one. */
export function createDraft(categoryId: string, definition: unknown, source = '', gameRule = '') {
  return rulesets().create({
    category: categoryId,
    status: 'draft',
    definition,
    source,
    ...(gameRule ? { game_rule: gameRule } : {}),
  })
}

export function saveDraft(id: string, data: { definition?: unknown; notes?: string }) {
  return rulesets().update(id, data)
}

/** Publishes a draft. The server validates it with the scoring engine (M2-12). */
export function publish(id: string, definition: unknown) {
  return rulesets().update(id, { definition, status: 'published' })
}

export function deleteDraft(id: string) {
  return rulesets().delete(id)
}

const gameRules = () => pb.collection<GameRuleRecord>('game_rules')

export function listGameRules(categoryId: string) {
  return gameRules().getFullList({
    filter: pb.filter('category = {:category}', { category: categoryId }),
    sort: 'position,key',
  })
}

export type GameRuleInput = Pick<GameRuleRecord, 'key' | 'name' | 'description'>

export function createGameRule(categoryId: string, data: GameRuleInput & { position: number }) {
  return gameRules().create({ ...data, category: categoryId })
}

export function updateGameRule(id: string, data: GameRuleInput) {
  return gameRules().update(id, data)
}

/** Deletes a game rule with all its versions (refused once it has scored results). */
export function deleteGameRule(id: string) {
  return gameRules().delete(id)
}
