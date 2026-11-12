// Shapes of the planner API (apps/backend/hooks/lib/planner.js, GET /api/events/{id}/planner)
// and of the `planner` part of the public event payload. See M4-14 in the roadmap.

export type PhaseKind = 'maintenance' | 'check' | 'scoring'

export const PHASE_ORDER: PhaseKind[] = ['maintenance', 'check', 'scoring']

export const BLOCK_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const
export type BlockColor = (typeof BLOCK_COLORS)[number]

export interface PlannerDay {
  id: string
  /** YYYY-MM-DD */
  date: string
  label: string
  /** HH:MM, defaults already applied by the server. */
  starts_at: string
  ends_at: string
}

export interface PlannerCategory {
  id: string
  name: string
  code: string
}

/** A custom column next to the categories, e.g. visitors or judges (M4-14-33). */
export interface PlannerColumn {
  id: string
  name: string
  position: number
  public: boolean
}

/** A column of the grid: a category or a custom column. */
export interface GridColumn {
  id: string
  name: string
  custom: boolean
}

export interface PlannerRound {
  id: string
  category: string
  key: string
  name: string
  position: number
  day: string
}

export interface PlannerPhase {
  id: string
  round: string
  phase: PhaseKind
  /** Day id or "". */
  day: string
  /** HH:MM or "" (unplaced). */
  starts_at: string
  duration_minutes: number
  updated?: string
}

export interface PlannerBlock {
  id: string
  day: string
  starts_at: string
  duration_minutes: number
  title: string
  place: string
  color: BlockColor | ''
  responsibility: string
  /** Covered category columns. */
  categories: string[]
  /** Covered custom columns. Both empty = all columns. */
  columns?: string[]
  public: boolean
  updated?: string
}

export type ItemKind = 'phase' | 'block'

export interface ItemRef {
  kind: ItemKind
  id: string
}

export interface PlannerIssue {
  code: 'outside_day' | 'phase_order' | 'round_overlap' | 'table_overlap' | 'judge_overlap'
  message: string
  items: ItemRef[]
}

export interface PlannerData {
  days: PlannerDay[]
  categories: PlannerCategory[]
  /** Custom columns after the categories (M4-14-33). */
  columns?: PlannerColumn[]
  rounds: PlannerRound[]
  phases: PlannerPhase[]
  blocks: PlannerBlock[]
  issues: PlannerIssue[]
  /** Staff view (internal blocks and issues included). */
  internal?: boolean
  can_edit?: boolean
}

/** Where a block is (or is dropped). */
export interface Placement {
  day: string
  starts_at: string
}

/** A drag or keyboard move from the board. */
export interface MoveRequest {
  ref: ItemRef
  placement: Placement
  /** New coverage of a single-column custom block moved to another column. */
  coverage?: Coverage
  /** Also move the round's later phases, keeping their gaps. */
  later: boolean
}

/** The columns a custom block covers. */
export interface Coverage {
  categories: string[]
  columns: string[]
}

/** Empty space clicked or dragged on the board. */
export interface CreateRequest {
  day: string
  /** Clicked column (category or custom column id), or "". */
  column: string
  custom: boolean
  starts_at: string
  duration_minutes: number
}
