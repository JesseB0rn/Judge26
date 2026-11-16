/// <reference path="../../pb_data/types.d.ts" />

// M10-31 – M10-34: data of the print center. One request returns what every printout needs:
// approved teams with their games, the rounds with their planner phases, and the active tables
// with their judges. Event managers, head judges and admins only (team names of draft events
// and judge names are not public). See docs/specifications/M10-setup-print-live.md.

function findById(app, collection, id) {
  if (!id) return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

function forbidden() {
  throw new ForbiddenError('Only event managers and head judges can use the print center.', {
    _error: new ValidationError(
      'print_not_allowed',
      'Only event managers and head judges can use the print center.',
    ),
  })
}

function canPrint(app, auth, eventId) {
  const a = require(`${__hooks}/lib/access.js`)
  return (
    a.isVerifiedUser(auth) &&
    (a.isAdmin(app, auth) || a.hasEventRole(app, auth, eventId, ['event_manager', 'head_judge']))
  )
}

/** GET /api/events/{id}/print */
function printData(app, auth, eventId) {
  const event = findById(app, 'events', eventId)
  if (!event) {
    throw new NotFoundError('The event was not found.', {
      _error: new ValidationError('event_not_found', 'The event was not found.'),
    })
  }
  if (!canPrint(app, auth, eventId)) forbidden()
  const params = { e: eventId }
  const list = (collection, filter, sort) =>
    app.findRecordsByFilter(collection, filter, sort || '', 0, 0, params)

  const names = {}
  const userName = (id) => {
    if (!(id in names)) {
      const user = findById(app, 'users', id)
      names[id] = user ? user.getString('name') || user.getString('email') : ''
    }
    return names[id]
  }

  const tables = require(`${__hooks}/lib/board.js`).orderTables(
    app,
    eventId,
    list('tables', 'event = {:e} && active = true'),
  )
  const phases = {}
  list('round_phases', 'round.category.event = {:e}').forEach((p) => {
    const round = p.getString('round')
    ;(phases[round] = phases[round] || []).push({
      phase: p.getString('phase'),
      day: p.getString('day'),
      starts_at: p.getString('day') ? p.getString('starts_at') : '',
      duration_minutes: p.getInt('duration_minutes'),
    })
  })
  const order = ['maintenance', 'check', 'scoring']
  const games = {}
  list('games', 'team.event = {:e}', 'attempt,sequence').forEach((g) => {
    const team = g.getString('team')
    ;(games[team] = games[team] || []).push({
      id: g.id,
      round: g.getString('round'),
      attempt: g.getInt('attempt'),
      table: g.getString('table'),
      sequence: g.getInt('sequence'),
    })
  })

  return {
    event: {
      id: event.id,
      name: event.getString('name'),
      season: event.getInt('season'),
      venue: event.getString('venue'),
      status: event.getString('status'),
    },
    days: list('competition_days', 'event = {:e}', 'date').map((d) => ({
      id: d.id,
      date: d.getString('date'),
      label: d.getString('label'),
    })),
    categories: list('categories', 'event = {:e}', 'code,name').map((c) => ({
      id: c.id,
      name: c.getString('name'),
      code: c.getString('code'),
    })),
    rounds: list('rounds', 'category.event = {:e}', 'position,key').map((r) => ({
      id: r.id,
      category: r.getString('category'),
      key: r.getString('key'),
      name: r.getString('name'),
      position: r.getInt('position'),
      day: r.getString('day'),
      phases: (phases[r.id] || []).sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase)),
    })),
    tables: tables.map((t) => ({
      id: t.id,
      name: t.getString('name'),
      categories: t.getStringSlice('categories'),
      judges: t
        .getStringSlice('judges')
        .map((id) => ({ id, name: userName(id) }))
        .filter((j) => j.name),
    })),
    teams: list('teams', 'event = {:e} && status = "approved"', 'name').map((t) => ({
      id: t.id,
      name: t.getString('name'),
      organization: t.getString('organization'),
      country: t.getString('country'),
      category: t.getString('category'),
      games: games[t.id] || [],
    })),
  }
}

module.exports = { printData, canPrint }
