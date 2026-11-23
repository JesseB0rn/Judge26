import { localeTag, t } from '@/i18n'
import type {
  CategoryRecord,
  CompetitionDayRecord,
  GameRuleRecord,
  RoundRecord,
} from '@/shared/types/records'
import { gameRuleIdForRound } from '@/modules/scoring/lib'
import type { RulesetState, ScoringPhase } from './api'

// The categories grid (M11-01 – M11-04): categories down, round positions across.

/** Ruleset state of a game, and of a category (its worst game). */
export type RulesState = 'published' | 'draft' | 'none'

/** The default robot check mode of a new round (M10-08); other modes are shown in the cell. */
export const DEFAULT_CHECK_MODE = 'synchronous'

export interface GridCell {
  round: RoundRecord
  /** 1-based position of the cell in its row. */
  position: number
  /** The game the round plays; shown only when the category has more than one. */
  game?: GameRuleRecord
  showGame: boolean
  day?: CompetitionDayRecord
  /** HH:MM of the scoring phase, or "" when not timed yet. */
  startsAt: string
  scoringPhase?: ScoringPhase
  /** The round's check mode, when it is not the default. */
  checkMode?: NonNullable<RoundRecord['check_mode']>
  /** Whether the round's game has a published ruleset. */
  rulesState: RulesState
}

export interface GridRow {
  category: CategoryRecord
  /** The category's rounds in position order. */
  rounds: RoundRecord[]
  cells: GridCell[]
  gameRules: GameRuleRecord[]
  /** Worst ruleset state of the category's games ("none" without any game). */
  rulesState: RulesState
}

export interface Grid {
  rows: GridRow[]
  /** Round columns: as many as the category with the most rounds has rounds. */
  columns: number
}

export interface GridInput {
  categories: CategoryRecord[]
  rounds: RoundRecord[]
  phases: ScoringPhase[]
  gameRules: GameRuleRecord[]
  rulesets: RulesetState[]
  days: CompetitionDayRecord[]
}

const RANK: Record<RulesState, number> = { published: 0, draft: 1, none: 2 }

/** State of one game: published, draft only, or none. */
export function gameRulesState(gameRuleId: string, rulesets: RulesetState[]): RulesState {
  if (!gameRuleId) return 'none'
  const own = rulesets.filter((r) => r.game_rule === gameRuleId)
  if (own.some((r) => r.status === 'published')) return 'published'
  return own.length ? 'draft' : 'none'
}

/** State of a category: the worst of its games; a category without games has none. */
export function categoryRulesState(
  gameRules: GameRuleRecord[],
  rulesets: RulesetState[],
): RulesState {
  if (!gameRules.length) return 'none'
  return gameRules
    .map((g) => gameRulesState(g.id, rulesets))
    .reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'published' as RulesState)
}

/** Lays out the grid: rows in code order, each category's rounds in position order. */
export function buildGrid(input: GridInput): Grid {
  const phaseOf = new Map(input.phases.map((p) => [p.round, p]))
  const dayOf = new Map(input.days.map((d) => [d.id, d]))
  const rows = [...input.categories]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((category): GridRow => {
      const gameRules = input.gameRules
        .filter((g) => g.category === category.id)
        .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
      const rulesets = input.rulesets.filter((r) => r.category === category.id)
      const rounds = input.rounds
        .filter((r) => r.category === category.id)
        .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
      const cells = rounds.map((round, i): GridCell => {
        const gameId = gameRuleIdForRound(round, gameRules)
        const phase = phaseOf.get(round.id)
        const dayId = phase?.day || round.day || ''
        const mode = round.check_mode ?? 'off'
        return {
          round,
          position: i + 1,
          game: gameRules.find((g) => g.id === gameId),
          showGame: gameRules.length > 1,
          day: dayOf.get(dayId),
          startsAt: phase?.day && phase.starts_at ? phase.starts_at : '',
          scoringPhase: phase,
          checkMode: mode === DEFAULT_CHECK_MODE ? undefined : mode,
          rulesState: gameRulesState(gameId, rulesets),
        }
      })
      return {
        category,
        rounds,
        cells,
        gameRules,
        rulesState: categoryRulesState(gameRules, rulesets),
      }
    })
  return { rows, columns: Math.max(0, ...rows.map((r) => r.cells.length)) }
}

/** Weekday of a YYYY-MM-DD date in the current language. */
export function weekday(date: string, style: 'short' | 'long'): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeTag(), {
    weekday: style,
    timeZone: 'UTC',
  })
}

/** What a cell calls its day: the day's label, else its weekday. */
export function dayName(day: CompetitionDayRecord | undefined, style: 'short' | 'long'): string {
  if (!day) return ''
  return day.label || weekday(day.date, style)
}

/** M11-04: a cell's accessible name, e.g. "RM-J, round 2, R2 Final, Sunday, not timed". */
export function cellLabel(category: CategoryRecord, cell: GridCell): string {
  const parts = [
    category.code,
    t('categories.grid.roundN', { n: cell.position }),
    `${cell.round.key} ${cell.round.name}`,
  ]
  if (cell.showGame && cell.game) parts.push(cell.game.name)
  if (cell.day) parts.push(dayName(cell.day, 'long'))
  parts.push(cell.startsAt || t('categories.grid.notTimed'))
  if (cell.rulesState !== 'published') parts.push(t('categories.grid.noPublishedRuleset'))
  return parts.join(', ')
}
