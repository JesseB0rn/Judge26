import { t } from '@/i18n'
import { formatDay } from '@/shared/format'
import { timeRange } from '@/modules/judging/lib'
import type { PrintData, PrintPhase, PrintRound, PrintTable, PrintTeam } from './types'

// Page builders of the print center (M10-31 – M10-34). One page per record: a team (parking
// label, workplace sheet) or a table (table assignment).

export interface PrintFilter {
  /** Category id or "" (all). */
  category: string
  /** Day id or "" (all): records with a game (or, for tables, a round) on that day. */
  day: string
}

const roundOf = (data: PrintData, id: string) => data.rounds.find((r) => r.id === id)

export function dayLabel(data: PrintData, id: string) {
  const day = data.days.find((d) => d.id === id)
  return day ? day.label || formatDay(day.date) : ''
}

export function categoryOf(data: PrintData, id: string) {
  return data.categories.find((c) => c.id === id)
}

/** Approved teams of the filter, by category code and name (M10-32, M10-33). */
export function filterTeams(data: PrintData, filter: PrintFilter): PrintTeam[] {
  const code = (team: PrintTeam) => categoryOf(data, team.category)?.code ?? ''
  return data.teams
    .filter((team) => !filter.category || team.category === filter.category)
    .filter(
      (team) => !filter.day || team.games.some((g) => roundOf(data, g.round)?.day === filter.day),
    )
    .sort((a, b) => code(a).localeCompare(code(b)) || a.name.localeCompare(b.name))
}

/** Rounds with games at tables, for the table assignment (M10-34). */
export function roundOptions(data: PrintData, filter: PrintFilter): PrintRound[] {
  const placed = new Set(
    data.teams.flatMap((team) => team.games.filter((g) => g.table).map((g) => g.round)),
  )
  const date = (round: PrintRound) => data.days.find((d) => d.id === round.day)?.date ?? '9999'
  return data.rounds
    .filter((r) => placed.has(r.id))
    .filter((r) => !filter.category || r.category === filter.category)
    .filter((r) => !filter.day || r.day === filter.day)
    .sort((a, b) => date(a).localeCompare(date(b)) || a.position - b.position)
}

export const PHASE_ORDER: PrintPhase['phase'][] = ['maintenance', 'check', 'scoring']

/** One line of a team's schedule on its workplace sheet (M10-33). */
export interface ScheduleLine {
  key: string
  round: string
  what: string
  /** Day label, or "" while unplaced. */
  day: string
  /** "10:00–11:00", "from 10:00" for games, or "" while unplaced. */
  time: string
  table: string
  /** Playing position at the table, 0 if not placed. */
  sequence: number
}

/**
 * Every phase and game of a team (M10-33): per round the maintenance and robot check phases, then
 * one line per game with its table and position (the time is the start of the round's scoring
 * run). Rounds in the order of their scoring day and position.
 */
export function teamSchedule(data: PrintData, team: PrintTeam): ScheduleLine[] {
  const lines: ScheduleLine[] = []
  const date = (id: string) => data.days.find((d) => d.id === id)?.date ?? '9999'
  const rounds = [...new Set(team.games.map((g) => g.round))]
    .map((id) => roundOf(data, id))
    .filter((r): r is PrintRound => !!r)
    .sort((a, b) => date(a.day).localeCompare(date(b.day)) || a.position - b.position)
  for (const round of rounds) {
    const title = `${round.key} · ${round.name}`
    for (const phase of round.phases) {
      if (phase.phase === 'scoring') continue
      lines.push({
        key: `${round.id}:${phase.phase}`,
        round: title,
        what: t(`planner.phase.${phase.phase}`),
        day: dayLabel(data, phase.day),
        time: phase.starts_at ? timeRange(phase.starts_at, phase.duration_minutes) : '',
        table: '',
        sequence: 0,
      })
    }
    const scoring = round.phases.find((p) => p.phase === 'scoring')
    for (const game of team.games.filter((g) => g.round === round.id)) {
      lines.push({
        key: game.id,
        round: title,
        what:
          game.attempt > 1
            ? `${t('planner.phase.scoring')} · ${t('judging.attempt', { attempt: game.attempt })}`
            : t('planner.phase.scoring'),
        day: dayLabel(data, scoring?.day || round.day),
        time: scoring?.starts_at ? t('teams.mine.from', { time: scoring.starts_at }) : '',
        table: data.tables.find((tb) => tb.id === game.table)?.name ?? '',
        sequence: game.sequence,
      })
    }
  }
  return lines
}

/** The tables a team plays at, with their judges (M10-33). */
export function teamTables(data: PrintData, team: PrintTeam): PrintTable[] {
  const ids = new Set(team.games.map((g) => g.table).filter(Boolean))
  return data.tables.filter((tb) => ids.has(tb.id))
}

/** One table assignment page (M10-34): the round's teams at the table in playing order. */
export interface TablePage {
  table: PrintTable
  teams: { game: string; sequence: number; name: string; organization: string; attempt: number }[]
}

export function tablePages(data: PrintData, roundId: string): TablePage[] {
  return data.tables
    .map((table) => ({
      table,
      teams: data.teams
        .flatMap((team) =>
          team.games
            .filter((g) => g.round === roundId && g.table === table.id)
            .map((g) => ({
              game: g.id,
              sequence: g.sequence,
              name: team.name,
              organization: team.organization,
              attempt: g.attempt,
            })),
        )
        .sort((a, b) => a.sequence - b.sequence || a.attempt - b.attempt),
    }))
    .filter((page) => page.teams.length > 0)
}
