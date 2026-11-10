/// <reference path="../../pb_data/types.d.ts" />

// M6: live competition data for public displays. See docs/specifications/M6-live.md.
//
// Public endpoints never expose restricted records (coach contacts, members, score values of
// unpublished results). They return a purpose-built view: the schedule with a coarse game
// state, and only the rankings a manager has published.

const PUBLIC_EVENT_STATUSES = ['published', 'archived']

// ---------------------------------------------------------------------------
// Revisions (realtime change signal)
// ---------------------------------------------------------------------------

function findOne(app, collection, filter, params) {
  const found = app.findRecordsByFilter(collection, filter, '', 1, 0, params)
  return found.length ? found[0] : null
}

function findById(app, collection, id) {
  if (!id) return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

/** Event id a changed record belongs to, or "" (e.g. a template category). */
function eventOf(app, collection, record) {
  switch (collection) {
    case 'events':
      return record.id
    case 'categories':
    case 'teams':
    case 'tables':
    case 'competition_days':
      return record.getString('event')
    case 'rounds':
    case 'ranking_snapshots': {
      const category = findById(app, 'categories', record.getString('category'))
      return category ? category.getString('event') : ''
    }
    case 'games': {
      const team = findById(app, 'teams', record.getString('team'))
      return team ? team.getString('event') : ''
    }
    case 'score_sheets': {
      const game = findById(app, 'games', record.getString('game'))
      const team = game ? findById(app, 'teams', game.getString('team')) : null
      return team ? team.getString('event') : ''
    }
    default:
      return ''
  }
}

/** Increments the event's revision; realtime subscribers are notified by the save. */
function bump(app, eventId) {
  if (!eventId || !findById(app, 'events', eventId)) return
  let record = findOne(app, 'live_revisions', 'event = {:event}', { event: eventId })
  if (!record) {
    record = new Record(app.findCollectionByNameOrId('live_revisions'))
    record.set('event', eventId)
  }
  record.set('revision', record.getInt('revision') + 1)
  app.save(record)
}

/** Called from record hooks. Never fails the original request. */
function touch(app, collection, record) {
  try {
    bump(app, eventOf(app, collection, record))
  } catch (err) {
    console.log(`[live] revision update failed for ${collection}/${record.id}: ${err}`)
  }
}

function revision(app, eventId) {
  const record = findOne(app, 'live_revisions', 'event = {:event}', { event: eventId })
  return record ? record.getInt('revision') : 0
}

// ---------------------------------------------------------------------------
// Public payloads
// ---------------------------------------------------------------------------

function publicEventRecord(app, eventId) {
  const event = findById(app, 'events', eventId)
  if (!event || PUBLIC_EVENT_STATUSES.indexOf(event.getString('status')) < 0) {
    throw new NotFoundError('The event was not found.')
  }
  return event
}

function serializeEvent(event) {
  return {
    id: event.id,
    name: event.getString('name'),
    season: event.getInt('season'),
    venue: event.getString('venue'),
    description: event.getString('description'),
    status: event.getString('status'),
  }
}

function serializeDays(app, eventId) {
  return app
    .findRecordsByFilter('competition_days', 'event = {:e}', 'date', 0, 0, { e: eventId })
    .map((d) => ({ id: d.id, date: d.getString('date'), label: d.getString('label') }))
}

function hasRanking(category) {
  const raw = category.getString('ranking')
  return !!raw && raw !== 'null'
}

/** What the public may see of a category's results (M6-03, M6-10). */
function publication(app, category) {
  const snapshot = findById(app, 'ranking_snapshots', category.getString('published_snapshot'))
  return {
    live: category.getBool('public_live') && hasRanking(category),
    official: snapshot
      ? {
          id: snapshot.id,
          title: snapshot.getString('title'),
          created: snapshot.getString('created'),
          published_at: category.getString('results_published_at'),
        }
      : null,
  }
}

/** Coarse state of a game, safe to show before results are published (M6-04, M6-08). */
function gameState(game, sheet) {
  if (game.getString('status') !== 'scheduled') return 'done'
  const status = sheet ? sheet.getString('status') : ''
  if (status === 'submitted') return 'in_review'
  if (status === 'draft' || status === 'rejected') return 'scoring'
  return 'upcoming'
}

function teamInfo(team) {
  return {
    id: team.id,
    name: team.getString('name'),
    organization: team.getString('organization'),
    country: team.getString('country'),
  }
}

/** GET /api/public/events: events whose live pages are public. */
function listEvents(app) {
  return app
    .findRecordsByFilter(
      'events',
      'status = "published" || status = "archived"',
      '-season,name',
      0,
      0,
    )
    .map((event) => ({ ...serializeEvent(event), days: serializeDays(app, event.id) }))
}

/**
 * GET /api/public/events/{id}: event, days, categories with their publication state, tables,
 * rounds and every game of an approved team with its state (schedule and progress).
 */
function eventPayload(app, eventId) {
  const event = publicEventRecord(app, eventId)
  const params = { e: eventId }
  const categories = app.findRecordsByFilter('categories', 'event = {:e}', 'name', 0, 0, params)
  const tables = app.findRecordsByFilter(
    'tables',
    'event = {:e} && active = true',
    'position,name',
    0,
    0,
    params,
  )
  const rounds = app.findRecordsByFilter(
    'rounds',
    'category.event = {:e}',
    'position,key',
    0,
    0,
    params,
  )
  const teams = app.findRecordsByFilter(
    'teams',
    'event = {:e} && status = "approved"',
    'name',
    0,
    0,
    params,
  )
  const teamById = {}
  teams.forEach((t) => (teamById[t.id] = t))
  const roundById = {}
  rounds.forEach((r) => (roundById[r.id] = r))
  const sheetByGame = {}
  app
    .findRecordsByFilter('score_sheets', 'game.team.event = {:e}', '', 0, 0, params)
    .forEach((s) => (sheetByGame[s.getString('game')] = s))

  const games = []
  app.findRecordsByFilter('games', 'team.event = {:e}', '', 0, 0, params).forEach((game) => {
    const team = teamById[game.getString('team')]
    const round = roundById[game.getString('round')]
    if (!team || !round) return
    games.push({
      id: game.id,
      category: round.getString('category'),
      round: round.id,
      team: teamInfo(team),
      table: game.getString('table'),
      sequence: game.getInt('sequence'),
      attempt: game.getInt('attempt') || 1,
      state: gameState(game, sheetByGame[game.id]),
    })
  })

  return {
    revision: revision(app, eventId),
    event: serializeEvent(event),
    days: serializeDays(app, eventId),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.getString('name'),
      code: c.getString('code'),
      ...publication(app, c),
    })),
    tables: tables.map((t) => ({ id: t.id, name: t.getString('name') })),
    rounds: rounds.map((r) => ({
      id: r.id,
      category: r.getString('category'),
      key: r.getString('key'),
      name: r.getString('name'),
      position: r.getInt('position'),
      day: r.getString('day'),
    })),
    games,
  }
}

/**
 * GET /api/public/categories/{id}/ranking: the published official ranking (a snapshot, never
 * changed by later corrections) and, if enabled, the live ranking from finalized scores.
 */
function rankingPayload(app, categoryId) {
  const category = findById(app, 'categories', categoryId)
  if (!category || !category.getString('event')) {
    throw new NotFoundError('The category was not found.')
  }
  const eventId = category.getString('event')
  publicEventRecord(app, eventId)
  const pub = publication(app, category)

  let official = null
  if (pub.official) {
    const snapshot = app.findRecordById('ranking_snapshots', pub.official.id)
    official = {
      ...pub.official,
      fingerprint: snapshot.getString('fingerprint'),
      config: JSON.parse(snapshot.getString('config')),
      result: JSON.parse(snapshot.getString('result')),
    }
  }

  // Progress of the category's approved teams (M6-02, M6-08).
  const approved = {}
  app
    .findRecordsByFilter('teams', 'category = {:c} && status = "approved"', '', 0, 0, {
      c: categoryId,
    })
    .forEach((t) => (approved[t.id] = true))
  const sheetByGame = {}
  app
    .findRecordsByFilter('score_sheets', 'game.team.category = {:c}', '', 0, 0, { c: categoryId })
    .forEach((s) => (sheetByGame[s.getString('game')] = s))
  const progress = { total: 0, done: 0, in_review: 0 }
  app
    .findRecordsByFilter('games', 'team.category = {:c}', '', 0, 0, { c: categoryId })
    .forEach((game) => {
      if (!approved[game.getString('team')]) return
      const state = gameState(game, sheetByGame[game.id])
      progress.total++
      if (state === 'done') progress.done++
      if (state === 'in_review') progress.in_review++
    })

  let live = null
  if (pub.live) {
    const engine = require(`${__hooks}/lib/ranking-engine.js`)
    const config = JSON.parse(category.getString('ranking'))
    const inputs = require(`${__hooks}/lib/ranking.js`).loadInputs(app, categoryId)
    // Only the ranking is public; inputs (game records) stay private.
    live = { config, result: engine.rank(engine.compileRankingConfig(config), inputs) }
  }

  // Organization and country of every ranked team (also withdrawn ones in old snapshots).
  const teams = {}
  const ids = {}
  ;[official, live].forEach((r) => r && r.result.entries.forEach((e) => (ids[e.team] = true)))
  Object.keys(ids).forEach((id) => {
    const team = findById(app, 'teams', id)
    if (team) teams[id] = teamInfo(team)
  })

  return {
    revision: revision(app, eventId),
    category: {
      id: category.id,
      name: category.getString('name'),
      code: category.getString('code'),
      event: eventId,
    },
    official,
    live,
    progress,
    teams,
  }
}

// ---------------------------------------------------------------------------
// Publication (M6-10)
// ---------------------------------------------------------------------------

/** The official snapshot must be one of the category's own snapshots. */
function validatePublication(app, category) {
  const id = category.getString('published_snapshot')
  if (!id) return
  const snapshot = findById(app, 'ranking_snapshots', id)
  if (!snapshot || snapshot.getString('category') !== category.id) {
    require(`${__hooks}/lib/errors.js`).fieldError(
      'published_snapshot',
      'invalid_snapshot',
      'Choose a ranking snapshot of this category.',
    )
  }
}

/**
 * Publication timestamps are set by the server only: when the official snapshot changes on an
 * update request, `results_published_at/by` record when and by whom.
 */
function stampPublication(record, auth, original) {
  const before = original ? original.getString('published_snapshot') : ''
  const after = record.getString('published_snapshot')
  if (before === after && original) {
    record.set('results_published_at', original.get('results_published_at'))
    record.set('results_published_by', original.getString('results_published_by'))
    return
  }
  if (after) {
    record.set('results_published_at', new DateTime())
    record.set('results_published_by', auth && !auth.isSuperuser() ? auth.id : '')
  } else {
    record.set('results_published_at', '')
    record.set('results_published_by', '')
  }
}

module.exports = {
  touch,
  bump,
  revision,
  listEvents,
  eventPayload,
  rankingPayload,
  validatePublication,
  stampPublication,
}
