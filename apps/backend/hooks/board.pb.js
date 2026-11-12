/// <reference path="../pb_data/types.d.ts" />

// M8-E: assignment board for event managers. See docs/specifications/M8-board.md and
// hooks/lib/board.js. Tables are created, renamed and deactivated through the record API.
//
// GET  /api/events/{id}/board
// POST /api/events/{id}/board/teams                   { team, table, index, round?, expected }
// POST /api/events/{id}/board/judges                  { judge, from, to, expected }
// POST /api/events/{id}/board/tables                  { category, name? }
// POST /api/events/{id}/board/tables/{table}/category { category, confirm?, expected_updated }
// Every write returns the whole board again.

routerAdd(
  'GET',
  '/api/events/{id}/board',
  (e) => {
    const board = require(`${__hooks}/lib/board.js`)
    return e.json(200, board.load(e.app, board.requireManager(e, false)))
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/events/{id}/board/teams',
  (e) => {
    const board = require(`${__hooks}/lib/board.js`)
    const eventId = board.requireManager(e, true)
    const body = e.requestInfo().body || {}
    let result
    e.app.runInTransaction((tx) => {
      result = board.moveTeam(tx, eventId, body)
    })
    const audit = require(`${__hooks}/lib/audit.js`)
    const team = e.app.findRecordById('teams', body.team)
    const table = result.to ? e.app.findRecordById('tables', result.to).getString('name') : ''
    const scope = body.round ? 'one round' : 'all rounds'
    audit.log(e.app, {
      auth: e.auth,
      action: 'board.move_team',
      collection: 'games',
      record: team.id,
      event: eventId,
      summary: table
        ? `Placed team “${team.getString('name')}” on table ${table} (${scope})`
        : `Took team “${team.getString('name')}” off the tables (${scope})`,
      changes: { table: [result.from, result.to], index: body.index, round: body.round || '' },
      ip: audit.requestIp(e),
    })
    return e.json(200, board.load(e.app, eventId))
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/events/{id}/board/judges',
  (e) => {
    const board = require(`${__hooks}/lib/board.js`)
    const eventId = board.requireManager(e, true)
    const body = e.requestInfo().body || {}
    e.app.runInTransaction((tx) => board.moveJudge(tx, eventId, body))
    const audit = require(`${__hooks}/lib/audit.js`)
    audit.log(e.app, {
      auth: e.auth,
      action: 'board.move_judge',
      collection: 'tables',
      record: body.to || body.from || '',
      event: eventId,
      summary: 'Moved a judge on the board',
      changes: { judge: body.judge, table: [body.from || '', body.to || ''] },
      ip: audit.requestIp(e),
    })
    return e.json(200, board.load(e.app, eventId))
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/events/{id}/board/tables/{table}/category',
  (e) => {
    const board = require(`${__hooks}/lib/board.js`)
    const eventId = board.requireManager(e, true)
    const body = e.requestInfo().body || {}
    const tableId = e.request.pathValue('table')
    let result
    e.app.runInTransaction((tx) => {
      result = board.setTableCategory(tx, eventId, tableId, body)
    })
    const audit = require(`${__hooks}/lib/audit.js`)
    const table = e.app.findRecordById('tables', tableId).getString('name')
    const category = e.app.findRecordById('categories', body.category).getString('name')
    audit.log(e.app, {
      auth: e.auth,
      action: 'board.table_category',
      collection: 'tables',
      record: tableId,
      event: eventId,
      summary: `Moved table ${table} to category ${category}`,
      changes: { category: body.category, unassigned: result.unassigned },
      ip: audit.requestIp(e),
    })
    return e.json(200, board.load(e.app, eventId))
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/events/{id}/board/tables',
  (e) => {
    const board = require(`${__hooks}/lib/board.js`)
    const eventId = board.requireManager(e, true)
    const body = e.requestInfo().body || {}
    let table
    e.app.runInTransaction((tx) => {
      table = board.createTable(tx, eventId, body)
    })
    const audit = require(`${__hooks}/lib/audit.js`)
    audit.log(e.app, {
      auth: e.auth,
      action: 'create',
      collection: 'tables',
      record: table.id,
      event: eventId,
      summary: `Created table “${table.getString('name')}”`,
      changes: { name: table.getString('name'), categories: body.category },
      ip: audit.requestIp(e),
    })
    return e.json(200, board.load(e.app, eventId))
  },
  $apis.requireAuth('users', '_superusers'),
)
