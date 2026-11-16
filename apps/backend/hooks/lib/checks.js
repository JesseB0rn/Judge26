/// <reference path="../../pb_data/types.d.ts" />

// M10-B: robot check, parts check and round file (M10-08 – M10-17).
// See docs/specifications/M10-checks.md.
//
// A round's robot check runs in one of three modes (rounds.check_mode):
// - off: no check; scoring is not gated (M10-14);
// - synchronous (default): every table checks its teams and confirms it is ready; the head judge
//   then releases the round, and only then can score sheets be started or submitted (M10-11);
// - asynchronous: a team's sheet unlocks as soon as that team's check is confirmed (M10-12).
// A parts check block (schedule_blocks.kind = parts_check) with "blocks the first round" gates
// the robot check and scoring of that day's first round in its categories until a head judge
// marks it completed (M10-16).

const MODES = ['off', 'synchronous', 'asynchronous']

function access() {
  return require(`${__hooks}/lib/access.js`)
}

function findById(app, collection, id) {
  if (!id) return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

function findOne(app, collection, filter, params) {
  const found = app.findRecordsByFilter(collection, filter, '', 1, 0, params)
  return found.length ? found[0] : null
}

function userRef(app, id, cache) {
  if (!id) return null
  const names = cache || {}
  if (!(id in names)) {
    const user = findById(app, 'users', id)
    names[id] = user ? user.getString('name') || 'Unnamed user' : 'Deleted user'
  }
  return { id, name: names[id] }
}

function badRequest(field, code, message) {
  require(`${__hooks}/lib/errors.js`).fieldError(field, code, message)
}

/** 409 with `data[field].code`, and `data._error` as a message code the web app translates. */
function conflict(field, code, message, errorCode) {
  const data = {}
  data[field] = new ValidationError(code, message)
  data._error = new ValidationError(errorCode, message)
  throw new ApiError(409, message, data)
}

function notFound(message) {
  throw new NotFoundError(message || 'Not found.', {
    _error: new ValidationError('not_found', message || 'Not found.'),
  })
}

function forbidden(message, code) {
  throw new ForbiddenError(message, { _error: new ValidationError(code, message) })
}

function readOnly() {
  throw new BadRequestError('Archived events are read-only.', {
    _error: new ValidationError('event_archived', 'Archived events are read-only.'),
  })
}

function modeOf(round) {
  const mode = round.getString('check_mode')
  return MODES.indexOf(mode) === -1 ? 'off' : mode
}

// ---------------------------------------------------------------------------
// Context and permissions
// ---------------------------------------------------------------------------

function loadRound(app, roundId) {
  const round = findById(app, 'rounds', roundId)
  if (!round) notFound('The round was not found.')
  const category = app.findRecordById('categories', round.getString('category'))
  const event = app.findRecordById('events', category.getString('event'))
  return { round, category, event }
}

function isReviewer(app, auth, eventId) {
  const a = access()
  return (
    a.isVerifiedUser(auth) &&
    (a.isAdmin(app, auth) || a.hasEventRole(app, auth, eventId, ['head_judge', 'event_manager']))
  )
}

function isTableJudge(app, auth, eventId, table) {
  const a = access()
  return (
    a.isVerifiedUser(auth) &&
    !!table &&
    table.getStringSlice('judges').indexOf(auth.id) !== -1 &&
    a.hasEventRole(app, auth, eventId, ['judge', 'head_judge'])
  )
}

function requireReviewer(app, auth, eventId) {
  if (!isReviewer(app, auth, eventId)) {
    forbidden('Only head judges and event managers can do this.', 'head_judges_only')
  }
}

/** Judges of the table, or head judges and managers of the event (stepping in, M10-07). */
function requireStaffAt(app, auth, eventId, table) {
  if (!isReviewer(app, auth, eventId) && !isTableJudge(app, auth, eventId, table)) {
    forbidden('This table is not assigned to you.', 'table_not_assigned')
  }
}

function requireWritable(event) {
  if (event.getString('status') === 'archived') readOnly()
}

// ---------------------------------------------------------------------------
// Round data
// ---------------------------------------------------------------------------

/** Placed games of a round (all attempts), optionally at one table. */
function roundGames(app, roundId, tableId) {
  return app.findRecordsByFilter(
    'games',
    tableId
      ? 'round = {:r} && sequence > 0 && table = {:t}'
      : 'round = {:r} && sequence > 0 && table != ""',
    'sequence',
    0,
    0,
    { r: roundId, t: tableId || '' },
  )
}

/** The tables of a round's games, in board order. */
function roundTables(app, round, event) {
  const ids = []
  roundGames(app, round.id).forEach((g) => {
    if (ids.indexOf(g.getString('table')) === -1) ids.push(g.getString('table'))
  })
  const tables = ids.map((id) => findById(app, 'tables', id)).filter(Boolean)
  return require(`${__hooks}/lib/board.js`).orderTables(app, event.id, tables)
}

/** Teams playing a round at a table, each once (its first game there), in playing order. */
function teamsAt(app, roundId, tableId) {
  const seen = {}
  const teams = []
  roundGames(app, roundId, tableId).forEach((g) => {
    const team = g.getString('team')
    if (seen[team]) return
    seen[team] = true
    teams.push({ team, game: g })
  })
  return teams
}

function checkRecord(app, roundId, teamId) {
  return findOne(app, 'robot_checks', 'round = {:r} && team = {:t}', { r: roundId, t: teamId })
}

function isChecked(app, roundId, teamId) {
  const record = checkRecord(app, roundId, teamId)
  return !!record && record.getBool('checked')
}

function readyRecord(app, roundId, tableId) {
  return findOne(app, 'robot_check_tables', 'round = {:r} && table = {:t}', {
    r: roundId,
    t: tableId,
  })
}

/** A check was recorded for the round: its mode can no longer change (M10-09). */
function checksRecorded(app, roundId) {
  return !!findOne(app, 'robot_checks', 'round = {:r} && checked = true', { r: roundId })
}

/** Scoring of a team in a round has started: a score sheet exists or a result was entered. */
function scoringStarted(app, roundId, teamId) {
  return app
    .findRecordsByFilter('games', 'round = {:r} && team = {:t}', '', 0, 0, {
      r: roundId,
      t: teamId,
    })
    .some(
      (g) =>
        g.getString('status') !== 'scheduled' ||
        !!findOne(app, 'score_sheets', 'game = {:g}', { g: g.id }),
    )
}

// ---------------------------------------------------------------------------
// Parts check (M10-15, M10-16)
// ---------------------------------------------------------------------------

/** A block covers a category: listed, or the block covers all columns. */
function coversCategory(block, categoryId) {
  const categories = block.getStringSlice('categories')
  if (categories.length) return categories.indexOf(categoryId) !== -1
  return !block.getStringSlice('columns').length
}

/** A table takes part in a parts check: it serves a covered category (or every category). */
function coversTable(block, table) {
  const categories = block.getStringSlice('categories')
  if (!categories.length) return !block.getStringSlice('columns').length
  const served = table.getStringSlice('categories')
  return !served.length || served.some((id) => categories.indexOf(id) !== -1)
}

/** The active tables a parts check block is confirmed by, in board order. */
function partsCheckTables(app, block) {
  const eventId = block.getString('event')
  const tables = app
    .findRecordsByFilter('tables', 'event = {:e} && active = true', '', 0, 0, { e: eventId })
    .filter((t) => coversTable(block, t))
  return require(`${__hooks}/lib/board.js`).orderTables(app, eventId, tables)
}

/**
 * The open parts check that gates a round, or null: a block of the round's day with "blocks the
 * first round", not completed, covering the round's category, and the round is that category's
 * first round of the day.
 */
function openPartsCheck(app, round) {
  const dayId = round.getString('day')
  if (!dayId) return null
  const categoryId = round.getString('category')
  const blocks = app
    .findRecordsByFilter(
      'schedule_blocks',
      'day = {:d} && kind = "parts_check" && blocks_first_round = true && completed_at = ""',
      'starts_at',
      0,
      0,
      { d: dayId },
    )
    .filter((b) => coversCategory(b, categoryId))
  if (!blocks.length) return null
  const first = app.findRecordsByFilter(
    'rounds',
    'category = {:c} && day = {:d}',
    'position,key',
    1,
    0,
    { c: categoryId, d: dayId },
  )
  return first.length && first[0].id === round.id ? blocks[0] : null
}

function partsCheckConflict(block) {
  conflict(
    'parts_check',
    'open',
    `The parts check “${block.getString('title')}” is not completed yet.`,
    'parts_check_open',
  )
}

// ---------------------------------------------------------------------------
// Scoring gate (M10-11, M10-12, M10-16)
// ---------------------------------------------------------------------------

/**
 * Why scoring of a team in a round is locked: "parts_check", "not_released" (synchronous round
 * before the release), "not_confirmed" (asynchronous round, team not checked) or "".
 */
function scoringGate(app, round, teamId) {
  if (openPartsCheck(app, round)) return 'parts_check'
  const mode = modeOf(round)
  if (mode === 'synchronous' && !round.getString('released_at')) return 'not_released'
  if (mode === 'asynchronous' && !isChecked(app, round.id, teamId)) return 'not_confirmed'
  return ''
}

/**
 * Refuses to start or submit a score sheet while scoring is locked. An absent team is never
 * checked, so in asynchronous mode its absence can be recorded without a check.
 */
function requireScoringOpen(app, round, teamId, outcome) {
  const block = openPartsCheck(app, round)
  if (block) partsCheckConflict(block)
  const mode = modeOf(round)
  if (mode === 'synchronous' && !round.getString('released_at')) {
    conflict(
      'round',
      'not_released',
      'The head judge has not released this round for scoring yet.',
      'round_not_released',
    )
  }
  if (mode === 'asynchronous' && outcome !== 'absent' && !isChecked(app, round.id, teamId)) {
    conflict(
      'check',
      'not_confirmed',
      'The robot check of this team is not confirmed yet.',
      'check_not_confirmed',
    )
  }
}

// ---------------------------------------------------------------------------
// Round file (M10-17)
// ---------------------------------------------------------------------------

function fileRecord(app, roundId) {
  return findOne(app, 'round_files', 'round = {:r}', { r: roundId })
}

function fileKind(name) {
  return /\.pdf$/i.test(name || '') ? 'pdf' : 'image'
}

function fileInfo(record) {
  if (!record) return null
  const name = record.getString('name') || record.getString('file')
  return { name, kind: fileKind(record.getString('file')), updated: record.getString('updated') }
}

/**
 * Judges see the round file once the check is confirmed: after the release in synchronous mode,
 * after their table's check is complete in asynchronous mode, at once without a check. Head
 * judges and managers always. `tableIds`: the tables the user judges in this round.
 */
function fileVisible(app, round, tableIds) {
  const mode = modeOf(round)
  if (mode === 'off') return true
  if (mode === 'synchronous') return !!round.getString('released_at')
  return tableIds.some((id) => !!readyRecord(app, round.id, id))
}

/** Tables of the round's games the user judges. */
function judgedTables(app, auth, round, event) {
  if (!auth) return []
  return roundTables(app, round, event)
    .filter((t) => isTableJudge(app, auth, event.id, t))
    .map((t) => t.id)
}

/** The round file for a user, or null when there is none or it is not shown yet. */
function visibleFile(app, auth, ctx, tableIds) {
  const record = fileRecord(app, ctx.round.id)
  if (!record) return null
  if (isReviewer(app, auth, ctx.event.id)) return fileInfo(record)
  return fileVisible(app, ctx.round, tableIds) ? fileInfo(record) : null
}

/** POST /api/rounds/{id}/file (multipart `file`): uploads or replaces the file. */
function uploadFile(e, roundId) {
  const app = e.app
  const ctx = loadRound(app, roundId)
  requireReviewer(app, e.auth, ctx.event.id)
  requireWritable(ctx.event)
  let files = []
  try {
    files = e.findUploadedFiles('file')
  } catch (_) {
    files = []
  }
  if (!files.length) badRequest('file', 'required', 'Choose an image or PDF file.')
  let record = fileRecord(app, roundId)
  if (!record) {
    record = new Record(app.findCollectionByNameOrId('round_files'))
    record.set('round', roundId)
  }
  record.set('file', files[0])
  record.set('name', String(files[0].originalName || '').slice(0, 255))
  if (!e.auth.isSuperuser()) record.set('uploaded_by', e.auth.id)
  app.save(record)
  return { file: fileInfo(record) }
}

/** DELETE /api/rounds/{id}/file */
function removeFile(app, auth, roundId) {
  const ctx = loadRound(app, roundId)
  requireReviewer(app, auth, ctx.event.id)
  requireWritable(ctx.event)
  const record = fileRecord(app, roundId)
  if (record) app.delete(record)
  return { file: null }
}

/**
 * GET /api/rounds/{id}/file: the file itself, for head judges and managers, and for judges of
 * the round once it is shown (M10-17). Anyone else gets 404; it is never public.
 */
function serveFile(e, roundId) {
  const app = e.app
  const round = findById(app, 'rounds', roundId)
  if (!round || !e.auth || !access().isVerifiedUser(e.auth)) notFound('The file was not found.')
  const ctx = loadRound(app, roundId)
  const reviewer = isReviewer(app, e.auth, ctx.event.id)
  const tables = reviewer ? [] : judgedTables(app, e.auth, ctx.round, ctx.event)
  if (!reviewer && !tables.length) notFound('The file was not found.')
  const record = fileRecord(app, roundId)
  if (!record) notFound('The file was not found.')
  if (!reviewer && !fileVisible(app, ctx.round, tables)) {
    conflict(
      'file',
      'not_released',
      'The round file is shown once the robot check is confirmed.',
      'round_file_hidden',
    )
  }
  const key = `${record.baseFilesPath()}/${record.getString('file')}`
  e.response.header().set('Cache-Control', 'private, no-store')
  const fsys = app.newFilesystem()
  try {
    fsys.serve(e.response, e.request, key, record.getString('name') || record.getString('file'))
  } finally {
    fsys.close()
  }
}

// ---------------------------------------------------------------------------
// Robot check state (M10-10)
// ---------------------------------------------------------------------------

/** One team's check, for the judge and the head judge. */
function teamState(app, roundId, entry, names) {
  const record = checkRecord(app, roundId, entry.team)
  const checked = !!record && record.getBool('checked')
  const team = findById(app, 'teams', entry.team)
  return {
    id: entry.team,
    name: team ? team.getString('name') : '',
    game: entry.game.id,
    sequence: entry.game.getInt('sequence'),
    checked,
    checked_at: checked ? record.getString('checked_at') : '',
    checked_by: checked ? userRef(app, record.getString('checked_by'), names) : null,
    client_saved_at: record ? record.getInt('client_saved_at') : 0,
    scoring_started: scoringStarted(app, roundId, entry.team),
  }
}

function readyState(app, roundId, tableId, names) {
  const ready = readyRecord(app, roundId, tableId)
  return ready
    ? { at: ready.getString('ready_at'), by: userRef(app, ready.getString('ready_by'), names) }
    : null
}

function roundInfo(app, ctx, names) {
  const { round, category } = ctx
  return {
    id: round.id,
    key: round.getString('key'),
    name: round.getString('name'),
    position: round.getInt('position'),
    check_mode: modeOf(round),
    released_at: round.getString('released_at'),
    released_by: userRef(app, round.getString('released_by'), names),
    release_reason: round.getString('release_reason'),
    category: {
      id: category.id,
      name: category.getString('name'),
      code: category.getString('code'),
    },
  }
}

function partsCheckRef(block) {
  return block ? { id: block.id, title: block.getString('title') } : null
}

/**
 * GET /api/rounds/{id}/checks?table= : the robot check of one table, shared by every device of
 * the table (M10-10). Table judges of that table, head judges and managers.
 */
function tableState(app, auth, roundId, tableId) {
  const ctx = loadRound(app, roundId)
  const table = findById(app, 'tables', tableId)
  if (!table || table.getString('event') !== ctx.event.id) notFound('The table was not found.')
  requireStaffAt(app, auth, ctx.event.id, table)
  const names = {}
  const reviewer = isReviewer(app, auth, ctx.event.id)
  return {
    round: roundInfo(app, ctx, names),
    event: {
      id: ctx.event.id,
      name: ctx.event.getString('name'),
      status: ctx.event.getString('status'),
    },
    table: { id: table.id, name: table.getString('name') },
    parts_check: partsCheckRef(openPartsCheck(app, ctx.round)),
    ready: readyState(app, roundId, table.id, names),
    teams: teamsAt(app, roundId, table.id).map((entry) => teamState(app, roundId, entry, names)),
    file: visibleFile(app, auth, ctx, [table.id]),
    can_release: reviewer && ctx.event.getString('status') !== 'archived',
  }
}

function tableOfTeam(app, roundId, teamId) {
  const games = app.findRecordsByFilter(
    'games',
    'round = {:r} && team = {:t} && sequence > 0 && table != ""',
    'sequence',
    1,
    0,
    { r: roundId, t: teamId },
  )
  return games.length ? findById(app, 'tables', games[0].getString('table')) : null
}

function requireCheckOpen(app, ctx) {
  if (modeOf(ctx.round) === 'off') {
    conflict('check', 'off', 'This round has no robot check.', 'check_off')
  }
  const block = openPartsCheck(app, ctx.round)
  if (block) partsCheckConflict(block)
}

/**
 * PUT /api/rounds/{id}/checks { team, checked, client_saved_at }: records or reopens a team's
 * check. A change made earlier on another device (older client_saved_at) does not overwrite a
 * newer one; the stored state is returned with `stale`. Reopening is refused once scoring of
 * the team started, and makes the table not ready again.
 */
function setCheck(app, auth, roundId, body) {
  const ctx = loadRound(app, roundId)
  const teamId = typeof body.team === 'string' ? body.team : ''
  const table = teamId ? tableOfTeam(app, roundId, teamId) : null
  if (!table) badRequest('team', 'invalid_team', 'The team does not play this round at a table.')
  requireStaffAt(app, auth, ctx.event.id, table)
  requireWritable(ctx.event)
  requireCheckOpen(app, ctx)
  const checked = body.checked !== false
  const savedAt = Number(body.client_saved_at || 0)
  const clientSavedAt = Number.isFinite(savedAt) && savedAt > 0 ? Math.round(savedAt) : 0
  const names = {}
  const entry = teamsAt(app, roundId, table.id).find((t) => t.team === teamId)

  let record = checkRecord(app, roundId, teamId)
  if (record && clientSavedAt && clientSavedAt < record.getInt('client_saved_at')) {
    return { team: teamState(app, roundId, entry, names), stale: true }
  }
  if (!checked && record && record.getBool('checked') && scoringStarted(app, roundId, teamId)) {
    conflict(
      'check',
      'scoring_started',
      'Scoring of this team has started; the check can no longer be reopened.',
      'check_scoring_started',
    )
  }
  app.runInTransaction((tx) => {
    if (!record) {
      record = new Record(tx.findCollectionByNameOrId('robot_checks'))
      record.set('round', roundId)
      record.set('team', teamId)
    }
    const was = record.getBool('checked')
    record.set('table', table.id)
    record.set('checked', checked)
    if (checked && !was) {
      record.set('checked_at', new DateTime())
      record.set('checked_by', auth.isSuperuser() ? '' : auth.id)
    }
    if (!checked) {
      record.set('checked_at', '')
      record.set('checked_by', '')
    }
    record.set('client_saved_at', clientSavedAt || Date.now())
    tx.save(record)
    if (!checked) {
      const ready = readyRecord(tx, roundId, table.id)
      if (ready) tx.delete(ready)
    }
  })
  return { team: teamState(app, roundId, entry, names), stale: false }
}

/**
 * POST /api/rounds/{id}/checks/ready { table, ready }: the table's check is complete (ready for
 * the run) or not. Not ready again is refused after a release.
 */
function setReady(app, auth, roundId, body) {
  const ctx = loadRound(app, roundId)
  const table = findById(app, 'tables', typeof body.table === 'string' ? body.table : '')
  if (!table || roundGames(app, roundId, table.id).length === 0) {
    badRequest('table', 'invalid_table', 'This table does not play the round.')
  }
  requireStaffAt(app, auth, ctx.event.id, table)
  requireWritable(ctx.event)
  requireCheckOpen(app, ctx)
  const ready = body.ready !== false
  const existing = readyRecord(app, roundId, table.id)
  if (ready && !existing) {
    const record = new Record(app.findCollectionByNameOrId('robot_check_tables'))
    record.set('round', roundId)
    record.set('table', table.id)
    record.set('ready_at', new DateTime())
    if (!auth.isSuperuser()) record.set('ready_by', auth.id)
    app.save(record)
  }
  if (!ready && existing) {
    if (modeOf(ctx.round) === 'synchronous' && ctx.round.getString('released_at')) {
      conflict('round', 'released', 'The round was already released.', 'round_released')
    }
    app.delete(existing)
  }
  return tableState(app, auth, roundId, table.id)
}

// ---------------------------------------------------------------------------
// Release (M10-11) and mode (M10-09)
// ---------------------------------------------------------------------------

function auditLog(app, auth, entry) {
  require(`${__hooks}/lib/audit.js`).log(app, { auth, ...entry })
}

/**
 * POST /api/rounds/{id}/release { reason? }: the head judge releases a synchronous round for
 * scoring. With tables not ready yet, a reason is required; the release is audited either way.
 */
function release(app, auth, roundId, body, ip) {
  const ctx = loadRound(app, roundId)
  requireReviewer(app, auth, ctx.event.id)
  requireWritable(ctx.event)
  if (modeOf(ctx.round) !== 'synchronous') {
    conflict(
      'round',
      'not_synchronous',
      'Only rounds with a synchronous robot check are released.',
      'round_not_synchronous',
    )
  }
  if (ctx.round.getString('released_at')) return progressOfRound(app, ctx, {})
  const open = roundTables(app, ctx.round, ctx.event).filter(
    (t) => !readyRecord(app, roundId, t.id),
  )
  const reason = String(body.reason || '').trim()
  if (reason.length > 2000) badRequest('reason', 'too_long', 'The reason is too long.')
  const names = open.map((t) => t.getString('name'))
  if (open.length && !reason) {
    badRequest(
      'reason',
      'required',
      `Not ready yet: ${names.join(', ')}. Enter why the round is released anyway.`,
    )
  }
  ctx.round.set('released_at', new DateTime())
  ctx.round.set('released_by', auth.isSuperuser() ? '' : auth.id)
  ctx.round.set('release_reason', open.length ? reason : '')
  app.save(ctx.round)
  auditLog(app, auth, {
    action: 'round.release',
    collection: 'rounds',
    record: roundId,
    event: ctx.event.id,
    summary: open.length
      ? `Released round ${ctx.round.getString('name')} while not ready: ${names.join(', ')}. Reason: ${reason}`
      : `Released round ${ctx.round.getString('name')} for scoring`,
    changes: open.length ? { not_ready: names, reason } : null,
    ip,
  })
  return progressOfRound(app, ctx, {})
}

/** DELETE /api/rounds/{id}/release: withdraws a release while no sheet of the round exists. */
function withdrawRelease(app, auth, roundId, ip) {
  const ctx = loadRound(app, roundId)
  requireReviewer(app, auth, ctx.event.id)
  requireWritable(ctx.event)
  if (!ctx.round.getString('released_at')) return progressOfRound(app, ctx, {})
  const started = roundGames(app, roundId).some(
    (g) => !!findOne(app, 'score_sheets', 'game = {:g}', { g: g.id }),
  )
  if (started) {
    conflict(
      'round',
      'scoring_started',
      'Scoring of this round has started; the release can no longer be withdrawn.',
      'round_scoring_started',
    )
  }
  ctx.round.set('released_at', '')
  ctx.round.set('released_by', '')
  ctx.round.set('release_reason', '')
  app.save(ctx.round)
  auditLog(app, auth, {
    action: 'round.withdraw_release',
    collection: 'rounds',
    record: roundId,
    event: ctx.event.id,
    summary: `Withdrew the release of round ${ctx.round.getString('name')}`,
    ip,
  })
  return progressOfRound(app, ctx, {})
}

/**
 * PUT /api/rounds/{id}/check-mode { mode }: head judges and managers choose synchronous or
 * asynchronous; only managers turn the check off (M10-08). The mode is fixed once a check was
 * recorded (also checked for direct round edits, see `guardModeChange`).
 */
function setMode(app, auth, roundId, body) {
  const ctx = loadRound(app, roundId)
  requireReviewer(app, auth, ctx.event.id)
  requireWritable(ctx.event)
  const mode = body.mode
  if (MODES.indexOf(mode) === -1) {
    badRequest('mode', 'invalid_value', 'Choose off, synchronous or asynchronous.')
  }
  if (mode === 'off' && !access().canManageEvent(app, auth, ctx.event.id)) {
    forbidden('Only event managers can turn the robot check off.', 'check_off_managers_only')
  }
  if (modeOf(ctx.round) !== mode) {
    ctx.round.set('check_mode', mode)
    app.save(ctx.round)
  }
  return progressOfRound(app, ctx, {})
}

/**
 * Round saves (onRecordUpdate): switching between synchronous and asynchronous after a check was
 * recorded is refused. Turning the check off stays possible for managers.
 */
function guardModeChange(app, round) {
  const before = round.original().getString('check_mode')
  const after = round.getString('check_mode')
  if (before === after || after === 'off' || before === 'off' || !before) return
  if (checksRecorded(app, round.id)) {
    badRequest(
      'check_mode',
      'checks_recorded',
      'Robot checks were already recorded; the check mode can no longer change.',
    )
  }
}

// ---------------------------------------------------------------------------
// Head judge progress (M10-13)
// ---------------------------------------------------------------------------

function dayRef(app, id) {
  const day = findById(app, 'competition_days', id)
  return day ? { id: day.id, date: day.getString('date'), label: day.getString('label') } : null
}

function progressOfRound(app, ctx, names) {
  const { round, event } = ctx
  const tables = roundTables(app, round, event).map((table) => {
    const teams = teamsAt(app, round.id, table.id)
    return {
      id: table.id,
      name: table.getString('name'),
      checked: teams.filter((t) => isChecked(app, round.id, t.team)).length,
      total: teams.length,
      ready: readyState(app, round.id, table.id, names),
    }
  })
  return {
    ...roundInfo(app, ctx, names),
    day: dayRef(app, round.getString('day')),
    checks_recorded: checksRecorded(app, round.id),
    parts_check: partsCheckRef(openPartsCheck(app, round)),
    file: fileInfo(fileRecord(app, round.id)),
    tables,
  }
}

function partsCheckProgress(app, block, names) {
  return {
    id: block.id,
    title: block.getString('title'),
    place: block.getString('place'),
    day: dayRef(app, block.getString('day')),
    starts_at: block.getString('starts_at'),
    duration_minutes: block.getInt('duration_minutes'),
    categories: block.getStringSlice('categories'),
    blocks_first_round: block.getBool('blocks_first_round'),
    completed_at: block.getString('completed_at'),
    completed_by: userRef(app, block.getString('completed_by'), names),
    completion_note: block.getString('completion_note'),
    tables: partsCheckTables(app, block).map((table) => {
      const confirmation = partsConfirmation(app, block.id, table.id)
      return {
        id: table.id,
        name: table.getString('name'),
        confirmed_at: confirmation ? confirmation.getString('confirmed_at') : '',
        confirmed_by: confirmation
          ? userRef(app, confirmation.getString('confirmed_by'), names)
          : null,
      }
    }),
  }
}

/**
 * GET /api/events/{id}/checks: parts checks and the robot check of every round with games, per
 * table, for head judges and managers (M10-13).
 */
function eventProgress(app, auth, eventId) {
  const event = findById(app, 'events', eventId)
  if (!event) notFound('The event was not found.')
  requireReviewer(app, auth, eventId)
  const names = {}
  const rounds = app
    .findRecordsByFilter('rounds', 'category.event = {:e}', 'position,key', 0, 0, { e: eventId })
    .filter((r) => roundGames(app, r.id).length > 0)
    .map((round) => {
      const category = app.findRecordById('categories', round.getString('category'))
      return progressOfRound(app, { round, category, event }, names)
    })
    .sort(
      (a, b) =>
        (a.day ? a.day.date : '9999').localeCompare(b.day ? b.day.date : '9999') ||
        a.position - b.position ||
        a.category.code.localeCompare(b.category.code),
    )
  const parts = app
    .findRecordsByFilter(
      'schedule_blocks',
      'event = {:e} && kind = "parts_check"',
      'starts_at',
      0,
      0,
      {
        e: eventId,
      },
    )
    .map((b) => partsCheckProgress(app, b, names))
    .sort(
      (a, b) =>
        (a.day ? a.day.date : '9999').localeCompare(b.day ? b.day.date : '9999') ||
        a.starts_at.localeCompare(b.starts_at),
    )
  return {
    event: { id: event.id, name: event.getString('name'), status: event.getString('status') },
    can_manage: access().canManageEvent(app, auth, eventId),
    parts_checks: parts,
    rounds,
  }
}

// ---------------------------------------------------------------------------
// Parts check confirmations (M10-16)
// ---------------------------------------------------------------------------

function partsConfirmation(app, blockId, tableId) {
  return findOne(app, 'parts_check_tables', 'block = {:b} && table = {:t}', {
    b: blockId,
    t: tableId,
  })
}

function loadPartsCheck(app, blockId) {
  const block = findById(app, 'schedule_blocks', blockId)
  if (!block || block.getString('kind') !== 'parts_check')
    notFound('The parts check was not found.')
  return { block, event: app.findRecordById('events', block.getString('event')) }
}

/** POST /api/parts-checks/{id}/tables/{table} { confirmed }: a table's judge confirms. */
function confirmPartsCheck(app, auth, blockId, tableId, body) {
  const { block, event } = loadPartsCheck(app, blockId)
  const table = findById(app, 'tables', tableId)
  if (!table || table.getString('event') !== event.id || !coversTable(block, table)) {
    badRequest('table', 'invalid_table', 'This table is not part of the parts check.')
  }
  requireStaffAt(app, auth, event.id, table)
  requireWritable(event)
  if (block.getString('completed_at')) {
    conflict(
      'parts_check',
      'completed',
      'The parts check was already completed.',
      'parts_check_completed',
    )
  }
  const confirmed = body.confirmed !== false
  const existing = partsConfirmation(app, blockId, tableId)
  if (confirmed && !existing) {
    const record = new Record(app.findCollectionByNameOrId('parts_check_tables'))
    record.set('block', blockId)
    record.set('table', tableId)
    record.set('confirmed_at', new DateTime())
    if (!auth.isSuperuser()) record.set('confirmed_by', auth.id)
    app.save(record)
  }
  if (!confirmed && existing) app.delete(existing)
  return partsCheckForTable(app, block, table, {})
}

/**
 * POST /api/parts-checks/{id}/complete { force?, note? }: the head judge marks the parts check
 * completed. With tables still open it is refused unless `force` (the app asks first, naming the
 * tables); a forced completion records the open tables in the audit log.
 */
function completePartsCheck(app, auth, blockId, body, ip) {
  const { block, event } = loadPartsCheck(app, blockId)
  requireReviewer(app, auth, event.id)
  requireWritable(event)
  if (!block.getString('completed_at')) {
    const open = partsCheckTables(app, block)
      .filter((t) => !partsConfirmation(app, blockId, t.id))
      .map((t) => t.getString('name'))
    if (open.length && body.force !== true) {
      conflict(
        'tables',
        'open',
        `Not confirmed yet: ${open.join(', ')}.`,
        'parts_check_tables_open',
      )
    }
    const note = String(body.note || '')
      .trim()
      .slice(0, 2000)
    block.set('completed_at', new DateTime())
    block.set('completed_by', auth.isSuperuser() ? '' : auth.id)
    block.set('completion_note', note)
    app.save(block)
    auditLog(app, auth, {
      action: 'parts_check.complete',
      collection: 'schedule_blocks',
      record: blockId,
      event: event.id,
      summary: open.length
        ? `Completed the parts check “${block.getString('title')}” with tables open: ${open.join(', ')}`
        : `Completed the parts check “${block.getString('title')}”`,
      changes: open.length ? { open_tables: open, note } : null,
      ip,
    })
  }
  return partsCheckProgress(app, block, {})
}

/** DELETE /api/parts-checks/{id}/complete: reopens a completed parts check. */
function reopenPartsCheck(app, auth, blockId, ip) {
  const { block, event } = loadPartsCheck(app, blockId)
  requireReviewer(app, auth, event.id)
  requireWritable(event)
  if (block.getString('completed_at')) {
    block.set('completed_at', '')
    block.set('completed_by', '')
    block.set('completion_note', '')
    app.save(block)
    auditLog(app, auth, {
      action: 'parts_check.reopen',
      collection: 'schedule_blocks',
      record: blockId,
      event: event.id,
      summary: `Reopened the parts check “${block.getString('title')}”`,
      ip,
    })
  }
  return partsCheckProgress(app, block, {})
}

function partsCheckForTable(app, block, table, names) {
  const confirmation = partsConfirmation(app, block.id, table.id)
  return {
    id: block.id,
    title: block.getString('title'),
    place: block.getString('place'),
    day: dayRef(app, block.getString('day')),
    starts_at: block.getString('starts_at'),
    duration_minutes: block.getInt('duration_minutes'),
    blocks_first_round: block.getBool('blocks_first_round'),
    completed_at: block.getString('completed_at'),
    table: { id: table.id, name: table.getString('name') },
    confirmed_at: confirmation ? confirmation.getString('confirmed_at') : '',
    confirmed_by: confirmation ? userRef(app, confirmation.getString('confirmed_by'), names) : null,
  }
}

/**
 * GET /api/judging/parts-checks[?table=]: the parts checks of the user's tables (or of the table
 * a head judge stepped in at), one entry per block and table.
 */
function judgePartsChecks(app, auth, seatId) {
  const a = access()
  if (!a.isVerifiedUser(auth)) forbidden('Verify your account first.', 'not_verified')
  let tables
  if (seatId) {
    const table = findById(app, 'tables', seatId)
    if (!table)
      forbidden('Only head judges of the event can judge at this table.', 'head_judges_only')
    const event = app.findRecordById('events', table.getString('event'))
    const allowed = a.isAdmin(app, auth) || a.hasEventRole(app, auth, event.id, ['head_judge'])
    if (!allowed || event.getString('status') === 'archived') {
      forbidden('Only head judges of the event can judge at this table.', 'head_judges_only')
    }
    tables = [table]
  } else {
    tables = app
      .findRecordsByFilter('tables', 'judges.id ?= {:u} && active = true', '', 0, 0, { u: auth.id })
      .filter((t) => {
        const event = findById(app, 'events', t.getString('event'))
        return (
          !!event &&
          event.getString('status') !== 'archived' &&
          a.hasEventRole(app, auth, event.id, ['judge', 'head_judge'])
        )
      })
  }
  const names = {}
  const rows = []
  tables.forEach((table) => {
    app
      .findRecordsByFilter('schedule_blocks', 'event = {:e} && kind = "parts_check"', '', 0, 0, {
        e: table.getString('event'),
      })
      .filter((b) => coversTable(b, table))
      .forEach((b) => rows.push(partsCheckForTable(app, b, table, names)))
  })
  return rows.sort(
    (a, b) =>
      (a.day ? a.day.date : '9999').localeCompare(b.day ? b.day.date : '9999') ||
      a.starts_at.localeCompare(b.starts_at) ||
      a.table.name.localeCompare(b.table.name, undefined, { numeric: true }),
  )
}

// ---------------------------------------------------------------------------
// Judge list rows (M5-01)
// ---------------------------------------------------------------------------

/**
 * The robot check state of a judge list row: mode, release, this team's check and its table's
 * completion, why scoring is locked, and the round file when the user may see it.
 */
function rowState(app, auth, round, event, game, cache) {
  const key = `checks:${round.id}`
  if (!(key in cache)) {
    cache[key] = {
      parts: openPartsCheck(app, round),
      file: fileRecord(app, round.id),
      reviewer: isReviewer(app, auth, event.id),
    }
  }
  const shared = cache[key]
  const mode = modeOf(round)
  const tableId = game.getString('table')
  const ready = mode !== 'off' && tableId ? !!readyRecord(app, round.id, tableId) : false
  const checked = mode !== 'off' && isChecked(app, round.id, game.getString('team'))
  let gate = ''
  if (shared.parts) gate = 'parts_check'
  else if (mode === 'synchronous' && !round.getString('released_at')) gate = 'not_released'
  else if (mode === 'asynchronous' && !checked) gate = 'not_confirmed'
  const fileShown =
    !!shared.file && (shared.reviewer || fileVisible(app, round, tableId ? [tableId] : []))
  return {
    robot_check: {
      mode,
      released_at: round.getString('released_at'),
      checked,
      table_ready: ready,
      parts_check: partsCheckRef(shared.parts),
    },
    gate,
    round_file: fileShown ? fileInfo(shared.file) : null,
  }
}

// ---------------------------------------------------------------------------
// Record API guards
// ---------------------------------------------------------------------------

const SERVER_FIELDS = {
  rounds: ['released_at', 'released_by', 'release_reason'],
  schedule_blocks: ['completed_at', 'completed_by', 'completion_note'],
}

/**
 * Record API requests on rounds and blocks: the release and completion fields are only set by
 * the routes (with their checks and audit). A new parts check blocks the first round unless the
 * request says otherwise (M10-16).
 */
function guardRequest(e, create) {
  const name = e.record.collection().name
  const sent = e.requestInfo().body || {}
  const field = (SERVER_FIELDS[name] || []).find((f) => f in sent)
  if (field && !(e.auth && e.auth.isSuperuser())) {
    badRequest(field, 'read_only', 'This field is set by the release or completion action.')
  }
  if (
    create &&
    name === 'schedule_blocks' &&
    e.record.getString('kind') === 'parts_check' &&
    !('blocks_first_round' in sent)
  ) {
    e.record.set('blocks_first_round', true)
  }
}

module.exports = {
  MODES,
  guardRequest,
  modeOf,
  scoringGate,
  requireScoringOpen,
  openPartsCheck,
  checksRecorded,
  guardModeChange,
  rowState,
  tableState,
  setCheck,
  setReady,
  release,
  withdrawRelease,
  setMode,
  eventProgress,
  confirmPartsCheck,
  completePartsCheck,
  reopenPartsCheck,
  judgePartsChecks,
  uploadFile,
  removeFile,
  serveFile,
  visibleFile,
  judgedTables,
}
