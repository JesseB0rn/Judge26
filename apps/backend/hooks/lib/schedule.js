/// <reference path="../../pb_data/types.d.ts" />

// M4: bridges PocketBase records and the scheduling engine (packages/scheduling-engine).
// The engine works on plain numbers (epoch milliseconds, durations in ms); this module converts.

const MINUTE = 60000
const DEFAULT_DURATION_MINUTES = 15
const JUDGE_ROLES = ['judge', 'head_judge']

const toMs = (value) => (value ? Date.parse(String(value).replace(' ', 'T')) : null)
const toPbDate = (ms) => new Date(ms).toISOString()

function exists(app, collection, filter, params) {
  try {
    app.findFirstRecordByFilter(collection, filter, params)
    return true
  } catch (_) {
    return false
  }
}

function eventIdOfRound(app, round) {
  return app.findRecordById('categories', round.getString('category')).getString('event')
}

/** Converts a stored game into the engine's shape. Results already recorded are never moved. */
function toSchedGame(app, game, rounds) {
  const roundId = game.getString('round')
  if (!rounds[roundId]) rounds[roundId] = app.findRecordById('rounds', roundId)
  const round = rounds[roundId]
  return {
    id: game.id,
    category: round.getString('category'),
    team: game.getString('team'),
    judges: game.getStringSlice('judges'),
    durationMs: (round.getInt('duration_minutes') || DEFAULT_DURATION_MINUTES) * MINUTE,
    table: game.getString('table') || null,
    start: toMs(game.getString('starts_at')),
    locked: game.getBool('locked') || game.getString('status') !== 'scheduled',
  }
}

/**
 * Loads everything the engine needs for one event. `excludeGameId` removes a stored copy of the
 * game being checked, so the caller can add its candidate state instead.
 */
function loadInput(app, eventId, excludeGameId) {
  const event = app.findRecordById('events', eventId)
  const params = { event: eventId }
  const tables = app.findRecordsByFilter('tables', 'event = {:event}', 'position', 0, 0, params)
  const periods = app.findRecordsByFilter('time_slots', 'event = {:event}', '', 0, 0, params)
  const games = app.findRecordsByFilter(
    'games',
    'round.category.event = {:event}',
    '',
    0,
    0,
    params,
  )
  const rounds = {}
  return {
    tables: tables.map((t) => ({
      id: t.id,
      active: t.getBool('active'),
      categories: t.getStringSlice('categories'),
    })),
    periods: periods.map((p) => ({
      id: p.id,
      kind: p.getString('kind'),
      start: toMs(p.getString('starts_at')),
      end: toMs(p.getString('ends_at')),
    })),
    games: games.filter((g) => g.id !== excludeGameId).map((g) => toSchedGame(app, g, rounds)),
    minRestMs: (event.getInt('min_rest_minutes') || 0) * MINUTE,
  }
}

/**
 * Checks a game that carries a placement (table, start time or judges) against the rest of its
 * event (M4-04 to M4-09). Unscheduled games pass without checks.
 */
function checkPlacement(app, game, round) {
  const judges = game.getStringSlice('judges')
  if (!game.getString('table') && !game.getString('starts_at') && judges.length === 0) return

  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const engine = require(`${__hooks}/lib/scheduling-engine.js`)
  const eventId = eventIdOfRound(app, round)

  for (const judge of judges) {
    if (
      !exists(
        app,
        'role_assignments',
        'user = {:user} && event = {:event} && (role = {:r1} || role = {:r2})',
        { user: judge, event: eventId, r1: JUDGE_ROLES[0], r2: JUDGE_ROLES[1] },
      )
    ) {
      fieldError('judges', 'invalid_judge', 'Judges must hold a judge role in this event.')
    }
  }

  const input = loadInput(app, eventId, game.id)
  const candidate = toSchedGame(app, game, { [round.id]: round })
  input.games.push(candidate)
  const issues = engine.issuesForGame(input, candidate.id)
  if (issues.length > 0) {
    fieldError(
      issues[0].field,
      issues[0].code,
      issues
        .slice(0, 5)
        .map((i) => i.message)
        .join(' '),
    )
  }
}

/**
 * Generates placements for the event's unlocked scheduled games (M4-06). Persists the result only
 * when it is complete; a dry run or an infeasible result changes nothing.
 */
function generate(app, eventId, dryRun) {
  const engine = require(`${__hooks}/lib/scheduling-engine.js`)
  const input = loadInput(app, eventId, '')
  const result = engine.generateSchedule(input)
  if (result.status !== 'complete' || dryRun) return result

  app.runInTransaction((tx) => {
    // Clear the unlocked games first, so the record checks never see a half-moved schedule.
    for (const game of input.games) {
      if (game.locked) continue
      const record = tx.findRecordById('games', game.id)
      record.set('table', '')
      record.set('starts_at', '')
      tx.save(record)
    }
    for (const placement of result.placements) {
      const record = tx.findRecordById('games', placement.gameId)
      record.set('table', placement.table)
      record.set('starts_at', toPbDate(placement.start))
      tx.save(record)
    }
  })
  return result
}

/** Whether any game is placed on the table (M4-11). */
function hasScheduledGames(app, tableId) {
  return exists(app, 'games', 'table = {:table}', { table: tableId })
}

/** All schedule issues of an event (M4-13). */
function validateEvent(app, eventId) {
  const engine = require(`${__hooks}/lib/scheduling-engine.js`)
  return engine.validateSchedule(loadInput(app, eventId, ''))
}

module.exports = {
  checkPlacement,
  generate,
  hasScheduledGames,
  validateEvent,
  loadInput,
  toMs,
  toPbDate,
}
