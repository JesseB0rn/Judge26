/// <reference path="../../pb_data/types.d.ts" />

// M8-E: assignment board (docs/specifications/M8-board.md).
//
// Tables are columns grouped by their (single) category; each table has judge slots and an
// ordered list of teams. By default the board edits every round of the category at once: the
// first round's order is the base, and each later round rotates it by one slot (round k puts the
// team of base slot s at slot s + k). With a round selected, only that round changes.
//
// Games that already started (not `scheduled`) are locked: they keep their table and sequence,
// and the other teams take the free sequence numbers around them.

function badRequest(code, message) {
  throw new BadRequestError(message, { _error: new ValidationError(code, message) })
}

function conflict(message) {
  throw new ApiError(
    409,
    message || 'The board was changed by someone else. Reload and try again.',
    {
      _error: new ValidationError('changed_meanwhile', message || 'The board changed meanwhile.'),
    },
  )
}

function byPosition(a, b) {
  return (
    a.getInt('position') - b.getInt('position') ||
    a.getString('name').localeCompare(b.getString('name'))
  )
}

function eventRounds(app, eventId) {
  return app.findRecordsByFilter('rounds', 'category.event = {:e}', 'position,created', 0, 0, {
    e: eventId,
  })
}

function eventGames(app, eventId) {
  return app.findRecordsByFilter('games', 'round.category.event = {:e}', '', 0, 0, { e: eventId })
}

/** The category a table belongs to on the board ('' when it has none or several). */
function tableCategory(table) {
  const categories = table.getStringSlice('categories')
  return categories.length === 1 ? categories[0] : ''
}

function isLocked(game) {
  return game.getString('status') !== 'scheduled'
}

/** GET /api/events/{id}/board */
function load(app, eventId) {
  const schedule = require(`${__hooks}/lib/schedule.js`)
  const categories = app
    .findRecordsByFilter('categories', 'event = {:e}', 'code,name', 0, 0, { e: eventId })
    .map((c) => ({
      id: c.id,
      name: c.getString('name'),
      code: c.getString('code'),
      judges_per_table: c.getInt('judges_per_table') || schedule.DEFAULT_JUDGES_PER_TABLE,
    }))
  const rounds = eventRounds(app, eventId).map((r) => ({
    id: r.id,
    category: r.getString('category'),
    key: r.getString('key'),
    name: r.getString('name'),
    position: r.getInt('position'),
  }))
  const tables = boardOrder(
    app,
    eventId,
    app.findRecordsByFilter('tables', 'event = {:e}', '', 0, 0, { e: eventId }),
  ).map((t) => ({
    id: t.id,
    name: t.getString('name'),
    position: t.getInt('position'),
    active: t.getBool('active'),
    category: tableCategory(t),
    categories: t.getStringSlice('categories'),
    judges: t.getStringSlice('judges'),
    updated: t.getString('updated'),
  }))
  const teams = app
    .findRecordsByFilter('teams', 'event = {:e} && status = "approved"', 'name', 0, 0, {
      e: eventId,
    })
    .map((t) => ({ id: t.id, name: t.getString('name'), category: t.getString('category') }))
  const games = eventGames(app, eventId).map((g) => ({
    id: g.id,
    round: g.getString('round'),
    team: g.getString('team'),
    table: g.getString('table'),
    sequence: g.getInt('sequence'),
    status: g.getString('status'),
    attempt: g.getInt('attempt'),
    updated: g.getString('updated'),
  }))
  const judges = {}
  app
    .findRecordsByFilter(
      'role_assignments',
      'event = {:e} && (role = "judge" || role = "head_judge") && user.preview_of = ""',
      '',
      0,
      0,
      { e: eventId },
    )
    .forEach((assignment) => {
      const id = assignment.getString('user')
      const role = assignment.getString('role')
      if (judges[id]) {
        if (role === 'head_judge') judges[id].role = role
        return
      }
      const user = app.findRecordById('users', id)
      judges[id] = { id, name: user.getString('name') || user.email(), role }
    })
  return {
    categories,
    rounds,
    tables,
    teams,
    games,
    judges: Object.keys(judges)
      .map((id) => judges[id])
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** The game of a team in a round that the board moves: its first scheduled attempt. */
function movableGame(games) {
  return (
    games
      .filter((g) => !isLocked(g))
      .sort((a, b) => a.getInt('attempt') - b.getInt('attempt'))[0] || null
  )
}

/** Index of games: round → team → [games]. */
function indexGames(games) {
  const index = {}
  games.forEach((g) => {
    const round = (index[g.getString('round')] = index[g.getString('round')] || {})
    ;(round[g.getString('team')] = round[g.getString('team')] || []).push(g)
  })
  return index
}

/** Teams on a table in a round, by sequence. */
function teamsOn(games, roundId, tableId) {
  return games
    .filter((g) => g.getString('round') === roundId && g.getString('table') === tableId)
    .sort((a, b) => a.getInt('sequence') - b.getInt('sequence'))
    .map((g) => g.getString('team'))
    .filter((team, i, list) => list.indexOf(team) === i)
}

/** Round k: the team of base slot s plays at slot (s + k) mod n. */
function rotate(list, k) {
  const n = list.length
  if (!n) return []
  const result = new Array(n)
  list.forEach((team, s) => (result[(s + k) % n] = team))
  return result
}

/** Rejects the write unless every game the client based it on is unchanged. */
function checkExpected(games, expected) {
  const given = expected && typeof expected === 'object' ? expected : {}
  const ids = {}
  games.forEach((g) => (ids[g.id] = g.getString('updated')))
  const keys = Object.keys(given)
  if (keys.length !== Object.keys(ids).length) conflict()
  keys.forEach((id) => {
    if (ids[id] !== given[id]) conflict()
  })
}

/** Games the client must state for a move (and the same set the server checks). */
function relevantGames(games, scopeRounds, tables, teamId) {
  return games.filter(
    (g) =>
      scopeRounds.indexOf(g.getString('round')) !== -1 &&
      (g.getString('team') === teamId || tables.indexOf(g.getString('table')) !== -1),
  )
}

/**
 * POST /api/events/{id}/board/teams { team, table, index, round, expected }.
 * Moves a team to `table` (or off the tables when empty) at `index` of the order, in every round
 * of its category or only in `round`. Runs in a transaction.
 */
function moveTeam(app, eventId, body) {
  const team = findIn(app, 'teams', body.team)
  if (!team || team.getString('event') !== eventId)
    badRequest('team_not_found', 'The team was not found.')
  if (team.getString('status') !== 'approved') {
    badRequest('team_not_approved', 'Only active teams can be placed.')
  }
  const categoryId = team.getString('category')
  const categoryRounds = eventRounds(app, eventId).filter(
    (r) => r.getString('category') === categoryId,
  )
  if (!categoryRounds.length) badRequest('no_rounds', 'The category has no rounds yet.')
  const roundIds = categoryRounds.map((r) => r.id)
  let scope = roundIds
  if (body.round) {
    if (roundIds.indexOf(body.round) === -1)
      badRequest('invalid_round', 'Choose a round of the team’s category.')
    scope = [body.round]
  }
  const baseRound = scope[0]

  const targetId = typeof body.table === 'string' ? body.table : ''
  if (targetId) {
    const target = findIn(app, 'tables', targetId)
    if (!target || target.getString('event') !== eventId) {
      badRequest('invalid_table', 'The table belongs to a different event.')
    }
    if (!target.getBool('active')) badRequest('table_inactive', 'The table is deactivated.')
    if (tableCategory(target) !== categoryId) {
      badRequest('incompatible_category', 'The table is not available for this category.')
    }
  }

  const all = eventGames(app, eventId)
  const index = indexGames(all)
  const baseGames = (index[baseRound] || {})[team.id] || []
  const placed = baseGames.filter((g) => g.getString('table'))[0]
  const sourceId = placed ? placed.getString('table') : ''
  const tables = [sourceId, targetId].filter((id, i, list) => id && list.indexOf(id) === i)

  checkExpected(relevantGames(all, scope, tables, team.id), body.expected)

  const position = Math.max(0, parseInt(body.index, 10) || 0)
  const edit = (lists) => {
    Object.keys(lists).forEach((id) => (lists[id] = lists[id].filter((t) => t !== team.id)))
    if (targetId) {
      const list = lists[targetId]
      list.splice(Math.min(position, list.length), 0, team.id)
    }
    return lists
  }

  // All rounds: one base order, rotated per round. One round: that round's order.
  let base = null
  if (!body.round) {
    base = {}
    tables.forEach((id) => (base[id] = teamsOn(all, baseRound, id)))
    edit(base)
  }

  const changes = []
  scope.forEach((roundId) => {
    const k = roundIds.indexOf(roundId)
    let desired
    if (base) {
      desired = {}
      tables.forEach((id) => (desired[id] = rotate(base[id], k)))
    } else {
      desired = {}
      tables.forEach((id) => (desired[id] = teamsOn(all, roundId, id)))
      edit(desired)
    }
    planRound(app, all, index[roundId] || {}, roundId, desired, team.id, targetId, changes)
  })

  // Two passes: free every changed game's place first, so sequences never collide mid-way.
  changes.forEach((change) => {
    if (change.game.isNew()) return
    if (!change.game.getString('table') && !change.game.getInt('sequence')) return
    change.game.set('table', '')
    change.game.set('sequence', 0)
    app.save(change.game)
  })
  changes.forEach((change) => {
    change.game.set('table', change.table)
    change.game.set('sequence', change.sequence)
    app.save(change.game)
  })
  return { moved: changes.length, from: sourceId, to: targetId, rounds: scope.length }
}

/** Adds the game changes of one round to `changes`. */
function planRound(app, all, roundIndex, roundId, desired, movingTeam, targetId, changes) {
  // game → { table, sequence }; a place on a table wins over leaving one.
  const decisions = new Map()
  const place = (game, table, sequence) => decisions.set(game, { table, sequence })
  const leave = (game) => {
    if (!decisions.has(game)) decisions.set(game, { table: '', sequence: 0 })
  }

  Object.keys(desired).forEach((tableId) => {
    const order = desired[tableId]
    const onTable = all.filter(
      (g) => g.getString('round') === roundId && g.getString('table') === tableId,
    )
    // Locked games stay; their sequence numbers are taken.
    const reserved = onTable.filter(isLocked).map((g) => g.getInt('sequence'))
    let next = 1
    const nextFree = () => {
      while (reserved.indexOf(next) !== -1) next++
      return next++
    }
    order.forEach((teamId) => {
      const games = roundIndex[teamId] || []
      if (games.some((g) => isLocked(g) && g.getString('table') === tableId)) return
      if (games.length && games.every(isLocked)) return
      let game = movableGame(games)
      if (!game) {
        game = new Record(app.findCollectionByNameOrId('games'))
        game.set('round', roundId)
        game.set('team', teamId)
        game.set('status', 'scheduled')
        game.set('attempt', 1)
        game.set('table', '')
        game.set('sequence', 0)
        roundIndex[teamId] = [game]
      }
      place(game, tableId, nextFree())
    })
    // Teams no longer on this table in this round leave it.
    onTable.forEach((g) => {
      if (!isLocked(g) && order.indexOf(g.getString('team')) === -1) leave(g)
    })
  })

  // Taken off the tables entirely.
  if (!targetId) {
    const game = movableGame(roundIndex[movingTeam] || [])
    if (game && game.getString('table')) leave(game)
  }

  decisions.forEach((decision, game) => {
    if (
      !game.isNew() &&
      game.getString('table') === decision.table &&
      game.getInt('sequence') === decision.sequence
    ) {
      return
    }
    changes.push({ game, table: decision.table, sequence: decision.sequence })
  })
}

function findIn(app, collection, id) {
  if (!id || typeof id !== 'string') return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

/**
 * POST /api/events/{id}/board/judges { judge, from, to, expected: { table: updated } }.
 * Moves a judge between tables, from the tray (`from` empty) or back to it (`to` empty). A judge
 * may be on several tables; the board warns about it (M8-29).
 */
function moveJudge(app, eventId, body) {
  const judge = String(body.judge || '')
  const from = body.from ? findIn(app, 'tables', body.from) : null
  const to = body.to ? findIn(app, 'tables', body.to) : null
  for (const table of [from, to]) {
    if (table === null) continue
    if (!table || table.getString('event') !== eventId) {
      badRequest('invalid_table', 'The table belongs to a different event.')
    }
  }
  if ((body.from && !from) || (body.to && !to))
    badRequest('invalid_table', 'The table was not found.')
  const expected = body.expected && typeof body.expected === 'object' ? body.expected : {}
  ;[from, to].forEach((table) => {
    if (table && expected[table.id] !== table.getString('updated')) conflict()
  })
  if (from && from.id !== (to && to.id)) {
    from.set(
      'judges',
      from.getStringSlice('judges').filter((id) => id !== judge),
    )
    app.save(from)
  }
  if (to) {
    const judges = to.getStringSlice('judges')
    if (judges.indexOf(judge) === -1) {
      to.set('judges', judges.concat([judge]))
      app.save(to)
    }
  }
}

/**
 * POST /api/events/{id}/board/tables/{table}/category { category, confirm, expected_updated }.
 * Moves a table into a category (M8-27). Teams of the old category are taken off the table, after
 * the manager confirmed it; tables with results of another category cannot move.
 */
function setTableCategory(app, eventId, tableId, body) {
  const table = findIn(app, 'tables', tableId)
  if (!table || table.getString('event') !== eventId)
    badRequest('invalid_table', 'The table was not found.')
  if (body.expected_updated !== table.getString('updated')) conflict()
  const category = findIn(app, 'categories', body.category)
  if (!category || category.getString('event') !== eventId) {
    badRequest('invalid_category', 'Choose a category of the event.')
  }
  const others = app.findRecordsByFilter(
    'games',
    'table = {:t} && round.category != {:c}',
    '',
    0,
    0,
    {
      t: table.id,
      c: category.id,
    },
  )
  if (others.some(isLocked)) {
    badRequest('table_has_results', 'Teams of another category already played on this table.')
  }
  if (others.length && !body.confirm) {
    badRequest('table_has_teams', 'Teams of another category are on this table.')
  }
  others.forEach((game) => {
    game.set('table', '')
    game.set('sequence', 0)
    app.save(game)
  })
  table.set('categories', [category.id])
  app.save(table)
  renumber(app, eventId)
  return { unassigned: others.length }
}

/** Board order: categories (by code, name), then tables without one; by position inside. */
function boardOrder(app, eventId, tables) {
  const order = {}
  app
    .findRecordsByFilter('categories', 'event = {:e}', 'code,name', 0, 0, { e: eventId })
    .forEach((c, i) => (order[c.id] = i))
  const rank = (t) => {
    const c = tableCategory(t)
    return c in order ? order[c] : Number.MAX_SAFE_INTEGER
  }
  return tables.slice().sort((a, b) => rank(a) - rank(b) || byPosition(a, b))
}

/** Renumbers table positions 1..n in board order, so groups stay contiguous. */
function renumber(app, eventId) {
  const tables = app.findRecordsByFilter('tables', 'event = {:e}', '', 0, 0, { e: eventId })
  boardOrder(app, eventId, tables).forEach((table, i) => {
    if (table.getInt('position') === i + 1) return
    table.set('position', i + 1)
    app.save(table)
  })
}

/**
 * POST /api/events/{id}/board/tables { category, name? }: a new active table at the end of the
 * category's group (M8-26). Without a name it is called after the next free number.
 */
function createTable(app, eventId, body) {
  const category = findIn(app, 'categories', body.category)
  if (!category || category.getString('event') !== eventId) {
    badRequest('invalid_category', 'Choose a category of the event.')
  }
  const tables = app.findRecordsByFilter('tables', 'event = {:e}', '', 0, 0, { e: eventId })
  const names = tables.map((t) => t.getString('name').toLowerCase())
  let name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    let n = tables.length + 1
    while (names.indexOf(`table ${n}`) !== -1) n++
    name = `Table ${n}`
  }
  const inGroup = tables.filter((t) => tableCategory(t) === category.id)
  const after = inGroup.length
    ? Math.max.apply(
        null,
        inGroup.map((t) => t.getInt('position')),
      )
    : 0
  const table = new Record(app.findCollectionByNameOrId('tables'))
  table.set('event', eventId)
  table.set('name', name)
  table.set('active', true)
  table.set('categories', [category.id])
  // Just after the group's last table; renumbering then closes the order.
  table.set('position', after)
  app.save(table)
  renumber(app, eventId)
  return table
}

/** Route guard: event managers and admins; writes also need a writable event. */
function requireManager(e, write) {
  const access = require(`${__hooks}/lib/access.js`)
  const eventId = e.request.pathValue('id')
  if (!access.isVerifiedUser(e.auth) || !access.canManageEvent(e.app, e.auth, eventId)) {
    throw new ForbiddenError('Only event managers and admins can use the board.', {
      _error: new ValidationError(
        'managers_only',
        'Only event managers and admins can use the board.',
      ),
    })
  }
  const event = findIn(e.app, 'events', eventId)
  if (!event) throw new NotFoundError('The event was not found.')
  if (write && event.getString('status') === 'archived') {
    badRequest('event_archived', 'Archived events cannot be changed.')
  }
  return eventId
}

module.exports = {
  requireManager,
  createTable,
  renumber,
  load,
  moveTeam,
  moveJudge,
  setTableCategory,
  rotate,
}
