/// <reference path="../../pb_data/types.d.ts" />

// M5: judge score sheets. A game has at most one score sheet:
//
//   (none) → draft → submitted → finalized
//                 ↖ rejected ↙
//
// Judges edit drafts (and rejected sheets) of the games on their table. Head judges and event
// managers ("reviewers") approve or reject submitted sheets; approval copies the result into the
// game, which then feeds the ranking. Finalized results only change through a correction with a
// reason. Every submission, review and correction is written to `score_audit`.

const OUTCOMES = ['completed', 'disqualified', 'absent']
const EDITABLE = ['draft', 'rejected']

function access() {
  return require(`${__hooks}/lib/access.js`)
}

function parseJson(raw, fallback) {
  if (!raw || raw === 'null') return fallback
  try {
    return JSON.parse(raw)
  } catch (_) {
    return fallback
  }
}

function findOne(app, collection, filter, params) {
  const found = app.findRecordsByFilter(collection, filter, '', 1, 0, params)
  return found.length ? found[0] : null
}

function badRequest(field, code, message) {
  require(`${__hooks}/lib/errors.js`).fieldError(field, code, message)
}

/** 409 with the sheet's current status as `data.status.code`, so clients can tell why. */
function conflict(message, status) {
  throw new ApiError(409, message, { status: new ValidationError(status || 'none', message) })
}

/** The game with everything needed to identify it at the table (M5-03). */
function loadContext(app, gameId) {
  let game
  try {
    game = app.findRecordById('games', gameId)
  } catch (_) {
    throw new NotFoundError('The game was not found.')
  }
  const round = app.findRecordById('rounds', game.getString('round'))
  const category = app.findRecordById('categories', round.getString('category'))
  const event = app.findRecordById('events', category.getString('event'))
  const team = app.findRecordById('teams', game.getString('team'))
  const tableId = game.getString('table')
  const table = tableId ? app.findRecordById('tables', tableId) : null
  const dayId = round.getString('day')
  let day = null
  if (dayId) {
    try {
      day = app.findRecordById('competition_days', dayId)
    } catch (_) {
      day = null
    }
  }
  return { game, round, category, event, team, table, day }
}

function permissions(app, auth, ctx) {
  const a = access()
  const eventId = ctx.event.id
  const verified = a.isVerifiedUser(auth)
  const reviewer =
    verified &&
    (a.isAdmin(app, auth) || a.hasEventRole(app, auth, eventId, ['head_judge', 'event_manager']))
  const tableJudge =
    verified &&
    !!ctx.table &&
    ctx.table.getString('judge') === auth.id &&
    a.hasEventRole(app, auth, eventId, ['judge', 'head_judge'])
  const archived = ctx.event.getString('status') === 'archived'
  return {
    canView: reviewer || tableJudge,
    canScore: !archived && (reviewer || tableJudge),
    canReview: !archived && reviewer,
    tableJudge,
  }
}

function requireView(app, auth, ctx) {
  const p = permissions(app, auth, ctx)
  if (!p.canView) throw new ForbiddenError('This game is not assigned to you.')
  return p
}

function sheetFor(app, gameId) {
  return findOne(app, 'score_sheets', 'game = {:game}', { game: gameId })
}

/** Plain snapshot of the scored fields (audit `before`/`after`). */
function snapshot(record) {
  if (!record) return null
  const points = record.get('points')
  return {
    outcome: record.getString('outcome') || record.getString('status'),
    values: parseJson(record.getString('values'), {}),
    time_ms: record.getInt('time_ms'),
    points: points === null || points === undefined ? null : record.getFloat('points'),
    ruleset: record.getString('ruleset'),
  }
}

function userName(app, id, cache) {
  if (!id) return ''
  if (cache && id in cache) return cache[id]
  let name = ''
  try {
    const user = app.findRecordById('users', id)
    name = user.getString('name') || 'Unnamed user'
  } catch (_) {
    name = 'Deleted user'
  }
  if (cache) cache[id] = name
  return name
}

function serializeSheet(app, sheet) {
  if (!sheet) return null
  const names = {}
  return {
    id: sheet.id,
    status: sheet.getString('status'),
    outcome: sheet.getString('outcome'),
    ruleset: sheet.getString('ruleset'),
    values: parseJson(sheet.getString('values'), {}),
    time_ms: sheet.getInt('time_ms'),
    points: sheet.getFloat('points'),
    client_saved_at: sheet.getInt('client_saved_at'),
    judge: { id: sheet.getString('judge'), name: userName(app, sheet.getString('judge'), names) },
    submitted_at: sheet.getString('submitted_at'),
    submitted_by: {
      id: sheet.getString('submitted_by'),
      name: userName(app, sheet.getString('submitted_by'), names),
    },
    reviewed_at: sheet.getString('reviewed_at'),
    reviewed_by: {
      id: sheet.getString('reviewed_by'),
      name: userName(app, sheet.getString('reviewed_by'), names),
    },
    review_note: sheet.getString('review_note'),
    corrections: sheet.getInt('corrections'),
    updated: sheet.getString('updated'),
  }
}

function history(app, gameId) {
  const names = {}
  return app
    .findRecordsByFilter('score_audit', 'game = {:game}', '-created', 0, 0, { game: gameId })
    .map((entry) => ({
      id: entry.id,
      action: entry.getString('action'),
      actor: { id: entry.getString('actor'), name: userName(app, entry.getString('actor'), names) },
      reason: entry.getString('reason'),
      before: parseJson(entry.getString('before'), null),
      after: parseJson(entry.getString('after'), null),
      created: entry.getString('created'),
    }))
}

/** The ruleset a sheet is scored with: the pinned version, else the category's active one. */
function rulesetFor(app, ctx, sheet) {
  const pinned = sheet && sheet.getString('ruleset')
  if (pinned) return app.findRecordById('rulesets', pinned)
  return require(`${__hooks}/lib/rulesets.js`).activeRuleset(app, ctx.category.id)
}

function serializeContext(ctx) {
  const { game, round, category, event, team, table, day } = ctx
  return {
    game: {
      id: game.id,
      status: game.getString('status'),
      attempt: game.getInt('attempt'),
      sequence: game.getInt('sequence'),
      points: game.getFloat('points'),
      time_ms: game.getInt('time_ms'),
      updated: game.getString('updated'),
    },
    team: {
      id: team.id,
      name: team.getString('name'),
      organization: team.getString('organization'),
      country: team.getString('country'),
    },
    round: {
      id: round.id,
      key: round.getString('key'),
      name: round.getString('name'),
      position: round.getInt('position'),
      testing_minutes: round.getInt('testing_minutes'),
      scoring_minutes: round.getInt('scoring_minutes'),
    },
    category: {
      id: category.id,
      name: category.getString('name'),
      code: category.getString('code'),
    },
    event: { id: event.id, name: event.getString('name'), status: event.getString('status') },
    table: table ? { id: table.id, name: table.getString('name') } : null,
    day: day ? { id: day.id, date: day.getString('date'), label: day.getString('label') } : null,
  }
}

/** Everything the score sheet page needs (GET /api/games/{id}/sheet). */
function sheetPayload(app, auth, gameId) {
  const ctx = loadContext(app, gameId)
  const p = requireView(app, auth, ctx)
  const sheet = sheetFor(app, gameId)
  const ruleset = rulesetFor(app, ctx, sheet)
  const status = sheet ? sheet.getString('status') : ''
  return {
    ...serializeContext(ctx),
    ruleset: ruleset
      ? {
          id: ruleset.id,
          version: ruleset.getInt('version'),
          definition: parseJson(ruleset.getString('definition'), null),
        }
      : null,
    sheet: serializeSheet(app, sheet),
    history: history(app, gameId),
    permissions: {
      canEdit: p.canScore && (!sheet || EDITABLE.includes(status)),
      canReview: p.canReview && status === 'submitted',
      canCorrect: p.canReview && status === 'finalized',
    },
  }
}

/** Reads and normalizes the scored fields of a request body. */
function readInput(body) {
  const outcome = body.outcome === undefined ? 'completed' : body.outcome
  if (!OUTCOMES.includes(outcome)) {
    badRequest('outcome', 'invalid_outcome', 'Choose completed, disqualified or absent.')
  }
  const values = body.values === undefined || body.values === null ? {} : body.values
  if (typeof values !== 'object' || Array.isArray(values)) {
    badRequest('values', 'invalid_type', 'Score values must be an object.')
  }
  const time = body.time_ms === undefined || body.time_ms === null ? 0 : Number(body.time_ms)
  if (!Number.isFinite(time) || time < 0) {
    badRequest('time_ms', 'invalid_time', 'The time must be zero or positive.')
  }
  const points =
    body.points === undefined || body.points === null || body.points === ''
      ? null
      : Number(body.points)
  if (points !== null && !Number.isFinite(points)) {
    badRequest('points', 'invalid_type', 'Points must be a number.')
  }
  const savedAt = Number(body.client_saved_at || 0)
  return {
    outcome,
    values,
    time_ms: Math.round(time),
    points,
    client_saved_at: Number.isFinite(savedAt) && savedAt > 0 ? Math.round(savedAt) : 0,
  }
}

/**
 * Scores the input with the ruleset. In `final` mode an incomplete or invalid sheet is
 * rejected (M5-T09); drafts are stored as entered so offline changes are never lost.
 */
function score(ruleset, input, mode) {
  if (input.outcome !== 'completed') return { points: null, values: {}, time_ms: 0 }
  if (!ruleset) {
    if (mode === 'final' && input.points === null) {
      badRequest('points', 'required', 'Enter the points of the game.')
    }
    return { points: input.points, values: {}, time_ms: input.time_ms }
  }
  const engine = require(`${__hooks}/lib/scoring-engine.js`)
  const compiled = engine.compileRuleset(parseJson(ruleset.getString('definition'), null))
  const result = engine.evaluate(compiled, input.values, { mode })
  if (mode === 'final' && !result.valid) {
    badRequest(
      'values',
      'invalid_score_sheet',
      result.issues
        .slice(0, 5)
        .map((i) => i.message)
        .join(' '),
    )
  }
  return { points: result.total, values: input.values, time_ms: input.time_ms }
}

function applyInput(sheet, ruleset, input, scored, auth) {
  sheet.set('outcome', input.outcome)
  sheet.set('ruleset', ruleset ? ruleset.id : '')
  sheet.set('values', scored.values)
  sheet.set('time_ms', scored.time_ms)
  sheet.set('points', scored.points)
  if (input.client_saved_at) sheet.set('client_saved_at', input.client_saved_at)
  if (auth && !auth.isSuperuser()) sheet.set('judge', auth.id)
}

function newSheet(app, gameId) {
  const sheet = new Record(app.findCollectionByNameOrId('score_sheets'))
  sheet.set('game', gameId)
  sheet.set('status', 'draft')
  sheet.set('corrections', 0)
  return sheet
}

function audit(app, gameId, action, auth, data) {
  const entry = new Record(app.findCollectionByNameOrId('score_audit'))
  entry.set('game', gameId)
  entry.set('action', action)
  if (auth && !auth.isSuperuser()) entry.set('actor', auth.id)
  entry.set('reason', data.reason || '')
  entry.set('before', data.before === undefined ? null : data.before)
  entry.set('after', data.after === undefined ? null : data.after)
  app.save(entry)
}

const STATUS_MESSAGES = {
  submitted: 'This score sheet was already submitted and is waiting for review.',
  finalized: 'This score is finalized. Only a head judge can correct it.',
}

/** PUT /api/games/{id}/sheet: autosave of a draft (M5-09, M5-14). */
function saveDraft(app, auth, gameId, body) {
  const ctx = loadContext(app, gameId)
  const p = requireView(app, auth, ctx)
  if (!p.canScore) throw new BadRequestError('Archived events are read-only.')
  const input = readInput(body)
  let sheet = sheetFor(app, gameId)
  if (sheet && !EDITABLE.includes(sheet.getString('status'))) {
    // An outdated offline draft never overwrites a submitted or finalized score (M5-T15).
    conflict(STATUS_MESSAGES[sheet.getString('status')], sheet.getString('status'))
  }
  if (sheet && input.client_saved_at && input.client_saved_at < sheet.getInt('client_saved_at')) {
    // A newer draft (e.g. from another device) is already stored.
    return { sheet: serializeSheet(app, sheet), stale: true }
  }
  if (!sheet) sheet = newSheet(app, gameId)
  const ruleset = rulesetFor(app, ctx, sheet)
  applyInput(sheet, ruleset, input, score(ruleset, input, 'draft'), auth)
  sheet.set('status', 'draft')
  app.save(sheet)
  return { sheet: serializeSheet(app, sheet), stale: false }
}

/** POST /api/games/{id}/sheet/submit (M5-10). */
function submit(app, auth, gameId, body) {
  const ctx = loadContext(app, gameId)
  const p = requireView(app, auth, ctx)
  if (!p.canScore) throw new BadRequestError('Archived events are read-only.')
  const input = readInput(body)
  let result = null
  app.runInTransaction((tx) => {
    let sheet = sheetFor(tx, gameId)
    if (sheet && !EDITABLE.includes(sheet.getString('status'))) {
      conflict(STATUS_MESSAGES[sheet.getString('status')], sheet.getString('status'))
    }
    if (!sheet) sheet = newSheet(tx, gameId)
    const ruleset = rulesetFor(tx, ctx, sheet)
    applyInput(sheet, ruleset, input, score(ruleset, input, 'final'), auth)
    sheet.set('status', 'submitted')
    sheet.set('submitted_at', new DateTime())
    if (!auth.isSuperuser()) sheet.set('submitted_by', auth.id)
    tx.save(sheet)
    audit(tx, gameId, 'submitted', auth, { after: snapshot(sheet) })
    result = sheet
  })
  return { sheet: serializeSheet(app, result) }
}

/** Copies the sheet's result into the game (which recomputes points with the scoring engine). */
function applyToGame(app, game, sheet) {
  const outcome = sheet.getString('outcome')
  game.set('status', outcome)
  if (outcome === 'completed') {
    const rulesetId = sheet.getString('ruleset')
    game.set('ruleset', rulesetId)
    game.set('values', rulesetId ? parseJson(sheet.getString('values'), {}) : null)
    game.set('points', rulesetId ? 0 : sheet.getFloat('points'))
    game.set('time_ms', sheet.getInt('time_ms'))
  } else {
    game.set('ruleset', '')
    game.set('values', null)
    game.set('time_ms', 0)
  }
  app.save(game)
}

function requireReviewer(app, auth, ctx) {
  const p = requireView(app, auth, ctx)
  if (!p.canReview) {
    throw new ForbiddenError('Only head judges and event managers can review scores.')
  }
}

/** POST /api/games/{id}/sheet/approve (M5-11, M5-T10). */
function approve(app, auth, gameId) {
  const ctx = loadContext(app, gameId)
  requireReviewer(app, auth, ctx)
  let result = null
  app.runInTransaction((tx) => {
    const sheet = sheetFor(tx, gameId)
    if (!sheet || sheet.getString('status') !== 'submitted') {
      conflict(
        'Only submitted score sheets can be approved.',
        sheet ? sheet.getString('status') : '',
      )
    }
    const game = tx.findRecordById('games', gameId)
    const before = snapshot(game)
    applyToGame(tx, game, sheet)
    sheet.set('status', 'finalized')
    sheet.set('reviewed_at', new DateTime())
    sheet.set('reviewed_by', auth.isSuperuser() ? '' : auth.id)
    sheet.set('review_note', '')
    tx.save(sheet)
    audit(tx, gameId, 'approved', auth, { before, after: snapshot(game) })
    result = sheet
  })
  return { sheet: serializeSheet(app, result) }
}

function requireReason(body) {
  const reason = String(body.reason || '').trim()
  if (!reason) badRequest('reason', 'required', 'Enter a reason.')
  if (reason.length > 2000) badRequest('reason', 'too_long', 'The reason is too long.')
  return reason
}

/** POST /api/games/{id}/sheet/reject { reason }: returns the sheet to the judge (M5-11). */
function reject(app, auth, gameId, body) {
  const ctx = loadContext(app, gameId)
  requireReviewer(app, auth, ctx)
  const reason = requireReason(body)
  let result = null
  app.runInTransaction((tx) => {
    const sheet = sheetFor(tx, gameId)
    if (!sheet || sheet.getString('status') !== 'submitted') {
      conflict(
        'Only submitted score sheets can be rejected.',
        sheet ? sheet.getString('status') : '',
      )
    }
    sheet.set('status', 'rejected')
    sheet.set('reviewed_at', new DateTime())
    sheet.set('reviewed_by', auth.isSuperuser() ? '' : auth.id)
    sheet.set('review_note', reason)
    tx.save(sheet)
    audit(tx, gameId, 'rejected', auth, { reason, before: snapshot(sheet) })
    result = sheet
  })
  return { sheet: serializeSheet(app, result) }
}

/** POST /api/games/{id}/sheet/correct { reason, ... }: changes a finalized score (M5-12). */
function correct(app, auth, gameId, body) {
  const ctx = loadContext(app, gameId)
  const p = requireView(app, auth, ctx)
  if (!p.canReview) {
    // M5-T11: judges cannot change finalized scores.
    throw new ForbiddenError('Only head judges and event managers can correct finalized scores.')
  }
  const reason = requireReason(body)
  const input = readInput(body)
  let result = null
  app.runInTransaction((tx) => {
    const sheet = sheetFor(tx, gameId)
    if (!sheet || sheet.getString('status') !== 'finalized') {
      conflict('Only finalized scores can be corrected.', sheet ? sheet.getString('status') : '')
    }
    const ruleset = rulesetFor(tx, ctx, sheet)
    const game = tx.findRecordById('games', gameId)
    const before = snapshot(game)
    applyInput(sheet, ruleset, input, score(ruleset, input, 'final'), null)
    sheet.set('corrections', sheet.getInt('corrections') + 1)
    sheet.set('reviewed_at', new DateTime())
    sheet.set('reviewed_by', auth.isSuperuser() ? '' : auth.id)
    tx.save(sheet)
    applyToGame(tx, game, sheet)
    audit(tx, gameId, 'corrected', auth, { reason, before, after: snapshot(game) })
    result = sheet
  })
  return { sheet: serializeSheet(app, result) }
}

/** Row of a judge's game list (M5-01, M5-03). */
function summary(app, game, cache) {
  const get = (collection, id) => {
    if (!id) return null
    const key = `${collection}:${id}`
    if (!(key in cache)) {
      try {
        cache[key] = app.findRecordById(collection, id)
      } catch (_) {
        cache[key] = null
      }
    }
    return cache[key]
  }
  const round = get('rounds', game.getString('round'))
  const category = get('categories', round.getString('category'))
  const event = get('events', category.getString('event'))
  const team = get('teams', game.getString('team'))
  const table = get('tables', game.getString('table'))
  const day = get('competition_days', round.getString('day'))
  const sheet = sheetFor(app, game.id)
  return {
    id: game.id,
    status: game.getString('status'),
    attempt: game.getInt('attempt'),
    sequence: game.getInt('sequence'),
    points: game.getFloat('points'),
    time_ms: game.getInt('time_ms'),
    team: { id: team.id, name: team.getString('name') },
    round: {
      id: round.id,
      key: round.getString('key'),
      name: round.getString('name'),
      position: round.getInt('position'),
    },
    category: {
      id: category.id,
      name: category.getString('name'),
      code: category.getString('code'),
    },
    event: { id: event.id, name: event.getString('name'), status: event.getString('status') },
    table: table ? { id: table.id, name: table.getString('name') } : null,
    day: day ? { id: day.id, date: day.getString('date'), label: day.getString('label') } : null,
    sheet: sheet
      ? {
          status: sheet.getString('status'),
          outcome: sheet.getString('outcome'),
          points: sheet.getFloat('points'),
          time_ms: sheet.getInt('time_ms'),
          updated: sheet.getString('updated'),
        }
      : null,
  }
}

function compareSummaries(a, b) {
  return (
    (a.day ? a.day.date : '9999').localeCompare(b.day ? b.day.date : '9999') ||
    a.round.position - b.round.position ||
    (a.table ? a.table.name : '').localeCompare(b.table ? b.table.name : '') ||
    a.sequence - b.sequence ||
    a.attempt - b.attempt ||
    a.team.name.localeCompare(b.team.name)
  )
}

/** GET /api/judging/assignments: games on the tables the user judges (M5-01). */
function assignments(app, auth) {
  const cache = {}
  const rows = []
  const tables = app.findRecordsByFilter('tables', 'judge = {:judge}', '', 0, 0, { judge: auth.id })
  for (const table of tables) {
    const event = app.findRecordById('events', table.getString('event'))
    if (event.getString('status') === 'archived') continue
    if (!access().hasEventRole(app, auth, event.id, ['judge', 'head_judge'])) continue
    const games = app.findRecordsByFilter('games', 'table = {:table} && sequence > 0', '', 0, 0, {
      table: table.id,
    })
    for (const game of games) rows.push(summary(app, game, cache))
  }
  return rows.sort(compareSummaries)
}

/** GET /api/events/{id}/judging: all scheduled games of an event for reviewers. */
function eventGames(app, auth, eventId) {
  const a = access()
  if (
    !a.isVerifiedUser(auth) ||
    !(a.isAdmin(app, auth) || a.hasEventRole(app, auth, eventId, ['head_judge', 'event_manager']))
  ) {
    throw new ForbiddenError('Only head judges and event managers can review scores.')
  }
  const cache = {}
  return app
    .findRecordsByFilter('games', 'team.event = {:event}', '', 0, 0, { event: eventId })
    .map((game) => summary(app, game, cache))
    .sort(compareSummaries)
}

const SCORED_FIELDS = ['status', 'points', 'time_ms', 'values', 'ruleset']

/**
 * Direct result edits through the games API (M3 result form). Refused while the judging
 * workflow owns the result (submitted or finalized sheet, invariant 1); otherwise audited.
 */
function guardDirectEdit(app, gameId, body) {
  if (!SCORED_FIELDS.some((key) => key in body)) return false
  const sheet = sheetFor(app, gameId)
  const status = sheet ? sheet.getString('status') : ''
  if (status === 'submitted' || status === 'finalized') {
    conflict(
      status === 'finalized'
        ? 'This result is finalized. Use a score correction with a reason to change it.'
        : 'This result is waiting for review in the judging workflow.',
      status,
    )
  }
  return true
}

function changed(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after)
}

module.exports = {
  sheetPayload,
  saveDraft,
  submit,
  approve,
  reject,
  correct,
  assignments,
  eventGames,
  guardDirectEdit,
  snapshot,
  audit,
  changed,
  sheetFor,
}
