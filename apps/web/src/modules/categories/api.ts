import { pb } from '@/shared/api/pocketbase'
import type { CategoryRecord } from '@/shared/types/records'

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
