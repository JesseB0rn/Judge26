import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useSort } from '../useSort'

interface Row {
  name: string
  members: number
  org?: string
}

const rows = ref<Row[]>([
  { name: 'Team 10', members: 2, org: 'B' },
  { name: 'team 2', members: 5 },
  { name: 'Team 1', members: 3, org: 'A' },
])
const columns = {
  name: (r: Row) => r.name,
  members: (r: Row) => r.members,
  org: (r: Row) => r.org,
}
const names = (list: Row[]) => list.map((r) => r.name)

describe('useSort', () => {
  it('keeps the original order until a column is chosen', () => {
    const { sorted } = useSort(rows, columns)
    expect(names(sorted.value)).toEqual(['Team 10', 'team 2', 'Team 1'])
  })

  it('cycles ascending, descending, then off', () => {
    const { sorted, toggle, directionOf } = useSort(rows, columns)
    toggle('name')
    expect(directionOf('name')).toBe('asc')
    expect(names(sorted.value)).toEqual(['Team 1', 'team 2', 'Team 10'])
    toggle('name')
    expect(directionOf('name')).toBe('desc')
    expect(names(sorted.value)).toEqual(['Team 10', 'team 2', 'Team 1'])
    toggle('name')
    expect(directionOf('name')).toBeUndefined()
    toggle('members')
    expect(names(sorted.value)).toEqual(['Team 10', 'Team 1', 'team 2'])
  })

  it('puts empty values last in both directions', () => {
    const { sorted, toggle } = useSort(rows, columns, { key: 'org', direction: 'asc' })
    expect(names(sorted.value)).toEqual(['Team 1', 'Team 10', 'team 2'])
    toggle('org')
    expect(names(sorted.value)).toEqual(['Team 10', 'Team 1', 'team 2'])
  })

  it('handles missing rows', () => {
    const { sorted } = useSort(() => undefined, columns)
    expect(sorted.value).toEqual([])
  })
})
