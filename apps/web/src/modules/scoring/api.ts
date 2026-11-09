import { pb } from '@/shared/api/pocketbase'
import type { CategoryRecord, RulesetRecord } from '@/shared/types/records'

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

export function createDraft(categoryId: string, definition: unknown, source = '') {
  return rulesets().create({ category: categoryId, status: 'draft', definition, source })
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
