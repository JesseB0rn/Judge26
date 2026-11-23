import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'

export type SortDirection = 'asc' | 'desc'
export type SortValue = string | number | null | undefined
export interface SortState<K extends string> {
  key: K
  direction: SortDirection
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const isEmpty = (value: SortValue) => value === null || value === undefined || value === ''

/** Compares two cell values: numbers by value, text by collation ("Team 2" before "Team 10"). */
export function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

/**
 * Client-side sorting for a data table. Each column key maps to the value it sorts by.
 * Clicking a column sorts ascending, then descending, then back to the rows' own order.
 * Empty values always go last; equal values keep their original order (the sort is stable).
 */
export function useSort<T, K extends string>(
  rows: MaybeRefOrGetter<readonly T[] | null | undefined>,
  columns: Record<K, (row: T) => SortValue>,
  initial: SortState<NoInfer<K>> | null = null,
) {
  const sort = ref(initial) as { value: SortState<K> | null }

  const sorted = computed(() => {
    const list = [...(toValue(rows) ?? [])]
    const state = sort.value
    if (!state) return list
    const value = columns[state.key]
    const factor = state.direction === 'asc' ? 1 : -1
    return list.sort((x, y) => {
      const a = value(x)
      const b = value(y)
      if (isEmpty(a) || isEmpty(b)) return Number(isEmpty(a)) - Number(isEmpty(b))
      return factor * compareValues(a, b)
    })
  })

  function toggle(key: K) {
    const current = sort.value
    if (current?.key !== key) sort.value = { key, direction: 'asc' }
    else if (current.direction === 'asc') sort.value = { key, direction: 'desc' }
    else sort.value = null
  }

  const directionOf = (key: K): SortDirection | undefined =>
    sort.value?.key === key ? sort.value.direction : undefined

  return { sort, sorted, toggle, directionOf }
}
