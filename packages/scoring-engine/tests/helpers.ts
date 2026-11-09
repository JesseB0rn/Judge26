import { compileRuleset, type Group, type ScoringNode } from '../src'

/** Builds a ruleset whose root sums the given children. */
export function ruleset(children: ScoringNode[], root: Partial<Group> = {}, precision = 2) {
  return compileRuleset({
    schemaVersion: 1,
    precision,
    root: { id: 'root', label: 'Total', type: 'group', aggregate: 'sum', children, ...root },
  })
}

export const bool = (id: string, points: number, extra: object = {}): ScoringNode => ({
  id,
  label: id,
  type: 'boolean',
  points,
  ...extra,
})

export const num = (id: string, pointsPerUnit: number, extra: object = {}): ScoringNode => ({
  id,
  label: id,
  type: 'number',
  pointsPerUnit,
  ...extra,
})

export const group = (
  id: string,
  aggregate: Group['aggregate'],
  children: ScoringNode[],
  extra: Partial<Group> = {},
): Group => ({ id, label: id, type: 'group', aggregate, children, ...extra })

export const codes = (issues: { code: string }[]) => issues.map((i) => i.code)
