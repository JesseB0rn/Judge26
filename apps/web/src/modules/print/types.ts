// Payload of GET /api/events/{id}/print (apps/backend/hooks/lib/print.js), M10-31 – M10-34.

export interface PrintPhase {
  phase: 'maintenance' | 'check' | 'scoring'
  /** Day id, or "" while unplaced. */
  day: string
  /** HH:MM, or "" while unplaced. */
  starts_at: string
  duration_minutes: number
}

export interface PrintData {
  event: { id: string; name: string; season: number; venue: string; status: string }
  days: { id: string; date: string; label: string }[]
  categories: { id: string; name: string; code: string }[]
  rounds: {
    id: string
    category: string
    key: string
    name: string
    position: number
    /** Day of the scoring run, or "". */
    day: string
    phases: PrintPhase[]
  }[]
  /** Active tables in board order. */
  tables: {
    id: string
    name: string
    categories: string[]
    judges: { id: string; name: string }[]
  }[]
  /** Approved teams. */
  teams: {
    id: string
    name: string
    organization: string
    country: string
    category: string
    games: { id: string; round: string; attempt: number; table: string; sequence: number }[]
  }[]
}

export type PrintTeam = PrintData['teams'][number]
export type PrintTable = PrintData['tables'][number]
export type PrintRound = PrintData['rounds'][number]

/** The printouts of the print center (M10-32 – M10-35). */
export type PrintoutKind = 'parking' | 'workplace' | 'tables' | 'qr'

/** What a table assignment page lists (M10-34). */
export type TableVariant = 'teams' | 'judges' | 'both'

/** Table assignments: one page per table, or one page per category with all its tables. */
export type TableLayout = 'pages' | 'single'
