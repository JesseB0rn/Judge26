/// <reference path="../../pb_data/types.d.ts" />

// M4-14: multi-day schedule planner. Day windows, round phases, custom blocks and the warnings
// the planner shows. See docs/specifications/M4-tables-and-scheduling.md ("Schedule planner").
//
// Times are local times of day ("HH:MM") on a competition day; nothing crosses midnight.

const DEFAULT_START = '08:00'
const DEFAULT_END = '18:00'
const PHASE_ORDER = ['maintenance', 'check', 'scoring']

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** Minutes since midnight of "HH:MM", or null for an empty/invalid value. */
function toMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '')
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? h * 60 + m : null
}

function dayWindow(day) {
  return {
    starts_at: day.getString('starts_at') || DEFAULT_START,
    ends_at: day.getString('ends_at') || DEFAULT_END,
  }
}

function findById(app, collection, id) {
  if (!id) return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

function fieldError(field, code, message) {
  require(`${__hooks}/lib/errors.js`).fieldError(field, code, message)
}

function eventOfRound(app, round) {
  const category = findById(app, 'categories', round.getString('category'))
  return category ? category.getString('event') : ''
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateDayWindow(record) {
  const { starts_at, ends_at } = dayWindow(record)
  if (toMinutes(ends_at) <= toMinutes(starts_at)) {
    fieldError('ends_at', 'invalid_range', 'The day must end after it starts.')
  }
}

function checkEnd(record) {
  const start = toMinutes(record.getString('starts_at'))
  if (start !== null && start + record.getInt('duration_minutes') > 24 * 60) {
    fieldError('duration_minutes', 'crosses_midnight', 'A block must end by midnight.')
  }
}

function checkDay(app, record, eventId) {
  const dayId = record.getString('day')
  if (!dayId) return
  const day = findById(app, 'competition_days', dayId)
  if (!day || day.getString('event') !== eventId) {
    fieldError('day', 'invalid_day', 'Choose a competition day of this event.')
  }
}

function validatePhase(app, record) {
  const round = findById(app, 'rounds', record.getString('round'))
  if (!round) return
  if (record.getString('starts_at') && !record.getString('day')) {
    fieldError('day', 'required', 'Choose the day of this phase.')
  }
  checkDay(app, record, eventOfRound(app, round))
  checkEnd(record)
}

function validateBlock(app, record) {
  const eventId = record.getString('event')
  checkDay(app, record, eventId)
  for (const id of record.getStringSlice('categories')) {
    const category = findById(app, 'categories', id)
    if (!category || category.getString('event') !== eventId) {
      fieldError('categories', 'invalid_category', 'Choose categories of this event.')
    }
  }
  for (const id of record.getStringSlice('columns')) {
    const column = findById(app, 'schedule_columns', id)
    if (!column || column.getString('event') !== eventId) {
      fieldError('columns', 'invalid_column', 'Choose columns of this event.')
    }
  }
  checkEnd(record)
}

/**
 * A custom column with blocks cannot be deleted: its blocks would silently cover all columns.
 */
function checkColumnDelete(app, column) {
  const used = app.findRecordsByFilter('schedule_blocks', 'columns ~ {:c}', '', 1, 0, {
    c: column.id,
  })
  if (used.length) {
    throw new BadRequestError('Blocks are still placed in this column. Move or delete them first.')
  }
}

/**
 * Planner edits must state the `updated` value they were based on (M4-14-19): a stale write is
 * refused with 409. Only direct API requests are checked; server-side syncing is not affected.
 */
function checkVersion(e, collection, fields) {
  const body = e.requestInfo().body || {}
  if (!fields.some((key) => key in body)) return
  const stored = e.app.findRecordById(collection, e.record.id)
  if (body.expected_updated !== stored.getString('updated')) {
    throw new ApiError(409, 'This block was changed by someone else. Reload and try again.', {})
  }
}

// ---------------------------------------------------------------------------
// Rounds <-> phases
// ---------------------------------------------------------------------------

function findPhase(app, roundId, phase) {
  const found = app.findRecordsByFilter(
    'round_phases',
    'round = {:round} && phase = {:phase}',
    '',
    1,
    0,
    { round: roundId, phase },
  )
  return found.length ? found[0] : null
}

function newPhase(app, round, phase, minutes) {
  const record = new Record(app.findCollectionByNameOrId('round_phases'))
  record.set('round', round.id)
  record.set('phase', phase)
  record.set('duration_minutes', Math.max(1, minutes))
  if (phase === 'scoring') record.set('day', round.getString('day'))
  return record
}

/**
 * Brings a round's maintenance and scoring phases in line with the round: maintenance exists
 * while testing_minutes > 0, scoring always; their durations and the scoring day follow the
 * round. Saves only what differs, so the phase hooks syncing back stop immediately.
 */
function syncPhasesFromRound(app, round) {
  const testing = round.getInt('testing_minutes')
  const maintenance = findPhase(app, round.id, 'maintenance')
  if (testing > 0 && !maintenance) app.save(newPhase(app, round, 'maintenance', testing))
  if (testing > 0 && maintenance && maintenance.getInt('duration_minutes') !== testing) {
    maintenance.set('duration_minutes', testing)
    app.save(maintenance)
  }
  if (testing <= 0 && maintenance) app.delete(maintenance)

  const minutes = round.getInt('scoring_minutes') || 1
  const scoring = findPhase(app, round.id, 'scoring')
  if (!scoring) {
    app.save(newPhase(app, round, 'scoring', minutes))
    return
  }
  let changed = false
  if (scoring.getInt('duration_minutes') !== minutes) {
    scoring.set('duration_minutes', minutes)
    changed = true
  }
  if (scoring.getString('day') !== round.getString('day')) {
    scoring.set('day', round.getString('day'))
    changed = true
  }
  if (changed) app.save(scoring)
}

/** Mirrors a phase back into its round (durations; the scoring day is the round's day). */
function syncRoundFromPhase(app, phase) {
  const round = findById(app, 'rounds', phase.getString('round'))
  if (!round) return
  const kind = phase.getString('phase')
  let changed = false
  if (
    kind === 'maintenance' &&
    round.getInt('testing_minutes') !== phase.getInt('duration_minutes')
  ) {
    round.set('testing_minutes', phase.getInt('duration_minutes'))
    changed = true
  }
  if (kind === 'scoring') {
    if (round.getInt('scoring_minutes') !== phase.getInt('duration_minutes')) {
      round.set('scoring_minutes', phase.getInt('duration_minutes'))
      changed = true
    }
    if (round.getString('day') !== phase.getString('day')) {
      round.set('day', phase.getString('day'))
      changed = true
    }
  }
  if (changed) app.save(round)
}

// ---------------------------------------------------------------------------
// Issues (M4-14-20 – M4-14-24): warnings, never blocking a save
// ---------------------------------------------------------------------------

function overlaps(a, b) {
  return a.day === b.day && a.start < b.end && b.start < a.end
}

/**
 * Pure issue detection over plain objects, so it can be tested and reused:
 * - days: { id, date, start, end }
 * - phases: { id, round, phase, day, start, end } (placed only)
 * - blocks: { id, day, start, end }
 * - rounds: { id, category }
 * - roundTables: { [roundId]: tableId[] }, tableJudges: { [tableId]: judgeId }
 */
function detectIssues(input) {
  const { days, phases, blocks, rounds, roundTables, tableJudges } = input
  const dayById = {}
  days.forEach((d) => (dayById[d.id] = d))
  const roundById = {}
  rounds.forEach((r) => (roundById[r.id] = r))
  const issues = []
  const ref = (kind, item) => ({ kind, id: item.id })
  const add = (code, message, items) => issues.push({ code, message, items })

  // Outside the day's window.
  for (const [kind, list] of [
    ['phase', phases],
    ['block', blocks],
  ]) {
    for (const item of list) {
      const day = dayById[item.day]
      if (day && (item.start < day.start || item.end > day.end)) {
        add('outside_day', 'Outside the hours of this day.', [ref(kind, item)])
      }
    }
  }

  // Phase order within a round: maintenance, check, scoring, without overlap.
  const byRound = {}
  for (const p of phases) (byRound[p.round] = byRound[p.round] || []).push(p)
  for (const list of Object.values(byRound)) {
    list.sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase))
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i]
      const b = list[i + 1]
      const da = dayById[a.day]
      const db = dayById[b.day]
      if (!da || !db) continue
      if (da.date > db.date || (da.date === db.date && a.end > b.start)) {
        add('phase_order', 'Phases must run in the order maintenance, robot check, scoring.', [
          ref('phase', a),
          ref('phase', b),
        ])
      }
    }
  }

  const tablesOf = (roundId) => roundTables[roundId] || []
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const a = phases[i]
      const b = phases[j]
      if (a.round === b.round || !overlaps(a, b)) continue
      const ra = roundById[a.round]
      const rb = roundById[b.round]
      if (!ra || !rb) continue
      const items = [ref('phase', a), ref('phase', b)]
      if (ra.category === rb.category) {
        add('round_overlap', 'Overlaps another round of the same category.', items)
      }
      const busy = (p) => p.phase === 'scoring' || p.phase === 'check'
      if (busy(a) && busy(b) && tablesOf(a.round).some((t) => tablesOf(b.round).includes(t))) {
        add('table_overlap', 'Another round uses the same table at this time.', items)
      }
      if (a.phase === 'scoring' && b.phase === 'scoring' && sharesJudge(a, b)) {
        add('judge_overlap', 'The same judge is needed on two tables at this time.', items)
      }
    }
  }
  // A single round whose tables share one judge needs that judge twice at once.
  for (const p of phases) {
    if (p.phase === 'scoring' && sharesJudge(p, p)) {
      add('judge_overlap', 'The same judge is needed on two tables at this time.', [
        ref('phase', p),
      ])
    }
  }

  function sharesJudge(a, b) {
    for (const t1 of tablesOf(a.round)) {
      for (const t2 of tablesOf(b.round)) {
        if (t1 !== t2 && tableJudges[t1] && tableJudges[t1] === tableJudges[t2]) return true
      }
    }
    return false
  }

  return issues
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function load(app, eventId, internal) {
  const params = { e: eventId }
  const days = app.findRecordsByFilter('competition_days', 'event = {:e}', 'date', 0, 0, params)
  const categories = app.findRecordsByFilter('categories', 'event = {:e}', 'name', 0, 0, params)
  const rounds = app.findRecordsByFilter(
    'rounds',
    'category.event = {:e}',
    'position,key',
    0,
    0,
    params,
  )
  const phases = app.findRecordsByFilter(
    'round_phases',
    'round.category.event = {:e}',
    '',
    0,
    0,
    params,
  )
  const blocks = app.findRecordsByFilter(
    'schedule_blocks',
    internal ? 'event = {:e}' : 'event = {:e} && public = true',
    'starts_at',
    0,
    0,
    params,
  )
  const columns = app.findRecordsByFilter(
    'schedule_columns',
    internal ? 'event = {:e}' : 'event = {:e} && public = true',
    'position,name',
    0,
    0,
    params,
  )
  return { days, categories, rounds, phases, blocks, columns }
}

function placed(record, dayIds) {
  const start = toMinutes(record.getString('starts_at'))
  const day = record.getString('day')
  if (start === null || !dayIds[day]) return null
  return { id: record.id, day, start, end: start + record.getInt('duration_minutes') }
}

function eventIssues(app, eventId, records) {
  const data = records || load(app, eventId, true)
  const dayIds = {}
  data.days.forEach((d) => (dayIds[d.id] = true))
  const roundTables = {}
  app
    .findRecordsByFilter('games', 'team.event = {:e} && table != ""', '', 0, 0, { e: eventId })
    .forEach((g) => {
      const list = (roundTables[g.getString('round')] = roundTables[g.getString('round')] || [])
      if (!list.includes(g.getString('table'))) list.push(g.getString('table'))
    })
  const tableJudges = {}
  app
    .findRecordsByFilter('tables', 'event = {:e}', '', 0, 0, { e: eventId })
    .forEach((t) => (tableJudges[t.id] = t.getString('judge')))

  return detectIssues({
    days: data.days.map((d) => {
      const w = dayWindow(d)
      return {
        id: d.id,
        date: d.getString('date'),
        start: toMinutes(w.starts_at),
        end: toMinutes(w.ends_at),
      }
    }),
    phases: data.phases
      .map((p) => {
        const item = placed(p, dayIds)
        return item && { ...item, round: p.getString('round'), phase: p.getString('phase') }
      })
      .filter(Boolean),
    blocks: data.blocks.map((b) => placed(b, dayIds)).filter(Boolean),
    rounds: data.rounds.map((r) => ({ id: r.id, category: r.getString('category') })),
    roundTables,
    tableJudges,
  })
}

/**
 * Planner data of an event. `internal` (event staff) includes internal blocks and the issues;
 * otherwise only public blocks are returned.
 */
function payload(app, eventId, internal) {
  const data = load(app, eventId, internal)
  return {
    days: data.days.map((d) => ({
      id: d.id,
      date: d.getString('date'),
      label: d.getString('label'),
      ...dayWindow(d),
    })),
    categories: data.categories.map((c) => ({
      id: c.id,
      name: c.getString('name'),
      code: c.getString('code'),
    })),
    // Custom columns after the categories (M4-14-33).
    columns: data.columns.map((c) => ({
      id: c.id,
      name: c.getString('name'),
      position: c.getInt('position'),
      public: c.getBool('public'),
    })),
    rounds: data.rounds.map((r) => ({
      id: r.id,
      category: r.getString('category'),
      key: r.getString('key'),
      name: r.getString('name'),
      position: r.getInt('position'),
      day: r.getString('day'),
    })),
    phases: data.phases.map((p) => ({
      id: p.id,
      round: p.getString('round'),
      phase: p.getString('phase'),
      day: p.getString('day'),
      starts_at: p.getString('starts_at'),
      duration_minutes: p.getInt('duration_minutes'),
      updated: p.getString('updated'),
    })),
    blocks: data.blocks.map((b) => ({
      id: b.id,
      day: b.getString('day'),
      starts_at: b.getString('starts_at'),
      duration_minutes: b.getInt('duration_minutes'),
      title: b.getString('title'),
      place: b.getString('place'),
      color: b.getString('color'),
      responsibility: b.getString('responsibility'),
      categories: b.getStringSlice('categories'),
      columns: b.getStringSlice('columns'),
      public: b.getBool('public'),
      updated: b.getString('updated'),
    })),
    issues: internal ? eventIssues(app, eventId, data) : [],
  }
}

/** Start time ("HH:MM" or "") of a round's scoring run, shown to judges and coaches (M4-14-30). */
function scoringStart(app, roundId) {
  const phase = findPhase(app, roundId, 'scoring')
  return phase && phase.getString('day') ? phase.getString('starts_at') : ''
}

module.exports = {
  scoringStart,
  DEFAULT_START,
  DEFAULT_END,
  toMinutes,
  dayWindow,
  validateDayWindow,
  validatePhase,
  validateBlock,
  checkColumnDelete,
  checkVersion,
  syncPhasesFromRound,
  syncRoundFromPhase,
  detectIssues,
  eventIssues,
  payload,
}
