/**
 * Ruleset definition format (schema version 1).
 * Specified in docs/specifications/M2-scoring-rulesets.md.
 */

export const SCHEMA_VERSION = 1

export type Aggregate = 'sum' | 'max' | 'min'
export type CompareOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'

/** Activates a node only when it holds (M2-10). */
export type Condition =
  | { ref: string; op: CompareOp; value: boolean | number | string }
  | { ref: string; op: 'in'; value: string[] }
  | { ref: string; op: 'set' | 'unset' }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }

interface NodeBase {
  /** Unique within the ruleset: letters, digits, `_` and `-`. */
  id: string
  label: string
  /** Instructions shown to judges (M2-01). */
  description?: string
  condition?: Condition
  /** The node's score is subtracted instead of added (M2-07). */
  deduction?: boolean
}

export interface BooleanCriterion extends NodeBase {
  type: 'boolean'
  /** Points when the value is `true`. */
  points: number
  required?: boolean
}

export interface NumberCriterion extends NodeBase {
  type: 'number'
  /** Only whole numbers are accepted (M2-03). */
  integer?: boolean
  min?: number
  max?: number
  /** Score = value × pointsPerUnit. */
  pointsPerUnit: number
  /** Display unit, e.g. "blocks". */
  unit?: string
  required?: boolean
}

export interface SelectOption {
  id: string
  label: string
  points: number
}

export interface SelectCriterion extends NodeBase {
  type: 'select'
  options: SelectOption[]
  required?: boolean
}

export interface Group extends NodeBase {
  type: 'group'
  aggregate: Aggregate
  children: ScoringNode[]
  /**
   * Allowed number of selected children (M2-05). `{ max: 1 }` makes the group
   * mutually exclusive; `{ min: 1 }` makes it required.
   */
  selection?: { min?: number; max?: number }
  /** Score bounds applied after aggregation, e.g. `{ min: 0 }` (M2-T07). */
  clamp?: { min?: number; max?: number }
  /** Score when no child is answered (M2-T06). Default 0. */
  empty?: number
}

export type Criterion = BooleanCriterion | NumberCriterion | SelectCriterion
export type ScoringNode = Criterion | Group

export interface RulesetDefinition {
  schemaVersion: typeof SCHEMA_VERSION
  /** Decimal places of all scores (0–4). Default 2. */
  precision?: number
  root: Group
}

/** Values entered on a score sheet, keyed by criterion id. Select values are option ids. */
export type ScoreValue = boolean | number | string | null
export type ScoreValues = Record<string, ScoreValue | undefined>

export interface Issue {
  code: string
  message: string
  /** JSON path into the definition (ruleset issues) or criterion id (value issues). */
  path: string
  nodeId?: string
}

export interface Explanation {
  id: string
  label: string
  type: ScoringNode['type']
  active: boolean
  /** Why the node is inactive. */
  inactiveReason?: 'condition' | 'parent'
  /** Entered value (criteria only). */
  value?: ScoreValue
  /** Contribution to the parent, after clamping and deduction. */
  points: number
  /** Human-readable calculation, e.g. "3 × 5 = 15". */
  formula: string
  children?: Explanation[]
  /** For max/min groups: id of the child that determined the score. */
  selectedChild?: string
}

export interface EvaluationResult {
  total: number
  /** No issues: the sheet can be submitted. */
  valid: boolean
  issues: Issue[]
  explanation: Explanation
}

export type EvaluationMode = 'draft' | 'final'
