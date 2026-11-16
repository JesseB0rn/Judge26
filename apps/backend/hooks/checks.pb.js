/// <reference path="../pb_data/types.d.ts" />

// M10-B: robot check, parts check and round file. See docs/specifications/M10-checks.md.

// Handlers run in their own VM: helpers live in lib/checks.js, not at the top of this file.

// GET /api/rounds/{id}/checks?table= -> the robot check of one table (M10-10)
routerAdd(
  'GET',
  '/api/rounds/{id}/checks',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    const table = e.request.url.query().get('table')
    return e.json(200, checks.tableState(e.app, e.auth, e.request.pathValue('id'), table))
  },
  $apis.requireAuth('users', '_superusers'),
)

// PUT /api/rounds/{id}/checks { team, checked, client_saved_at } -> records or reopens a check
routerAdd(
  'PUT',
  '/api/rounds/{id}/checks',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.setCheck(e.app, e.auth, e.request.pathValue('id'), e.requestInfo().body || {}),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// POST /api/rounds/{id}/checks/ready { table, ready } -> the table's check is complete (M10-11)
routerAdd(
  'POST',
  '/api/rounds/{id}/checks/ready',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.setReady(e.app, e.auth, e.request.pathValue('id'), e.requestInfo().body || {}),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// POST /api/rounds/{id}/release { reason? } -> releases a synchronous round (head judges)
routerAdd(
  'POST',
  '/api/rounds/{id}/release',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.release(
        e.app,
        e.auth,
        e.request.pathValue('id'),
        e.requestInfo().body || {},
        require(`${__hooks}/lib/audit.js`).requestIp(e),
      ),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// DELETE /api/rounds/{id}/release -> withdraws the release while nothing was scored
routerAdd(
  'DELETE',
  '/api/rounds/{id}/release',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.withdrawRelease(
        e.app,
        e.auth,
        e.request.pathValue('id'),
        require(`${__hooks}/lib/audit.js`).requestIp(e),
      ),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// PUT /api/rounds/{id}/check-mode { mode } -> off | synchronous | asynchronous (M10-08, M10-09)
routerAdd(
  'PUT',
  '/api/rounds/{id}/check-mode',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.setMode(e.app, e.auth, e.request.pathValue('id'), e.requestInfo().body || {}),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// GET /api/rounds/{id}/file -> the randomization file (M10-17); 404 for anyone not involved
routerAdd('GET', '/api/rounds/{id}/file', (e) => {
  require(`${__hooks}/lib/checks.js`).serveFile(e, e.request.pathValue('id'))
})

// POST /api/rounds/{id}/file (multipart: file) -> uploads or replaces it (head judges)
routerAdd(
  'POST',
  '/api/rounds/{id}/file',
  (e) => e.json(200, require(`${__hooks}/lib/checks.js`).uploadFile(e, e.request.pathValue('id'))),
  $apis.requireAuth('users', '_superusers'),
)

// DELETE /api/rounds/{id}/file
routerAdd(
  'DELETE',
  '/api/rounds/{id}/file',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(200, checks.removeFile(e.app, e.auth, e.request.pathValue('id')))
  },
  $apis.requireAuth('users', '_superusers'),
)

// GET /api/events/{id}/checks -> parts checks and robot checks per round and table (M10-13)
routerAdd(
  'GET',
  '/api/events/{id}/checks',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(200, checks.eventProgress(e.app, e.auth, e.request.pathValue('id')))
  },
  $apis.requireAuth('users', '_superusers'),
)

// GET /api/judging/parts-checks[?table=] -> parts checks of the user's tables (M10-16)
routerAdd(
  'GET',
  '/api/judging/parts-checks',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    const table = e.request.url.query().get('table')
    return e.json(200, checks.judgePartsChecks(e.app, e.auth, table))
  },
  $apis.requireAuth('users', '_superusers'),
)

// POST /api/parts-checks/{id}/tables/{table} { confirmed } -> a table confirms the parts check
routerAdd(
  'POST',
  '/api/parts-checks/{id}/tables/{table}',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.confirmPartsCheck(
        e.app,
        e.auth,
        e.request.pathValue('id'),
        e.request.pathValue('table'),
        e.requestInfo().body || {},
      ),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// POST /api/parts-checks/{id}/complete { force?, note? } -> the head judge completes it
routerAdd(
  'POST',
  '/api/parts-checks/{id}/complete',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.completePartsCheck(
        e.app,
        e.auth,
        e.request.pathValue('id'),
        e.requestInfo().body || {},
        require(`${__hooks}/lib/audit.js`).requestIp(e),
      ),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// DELETE /api/parts-checks/{id}/complete -> reopens it
routerAdd(
  'DELETE',
  '/api/parts-checks/{id}/complete',
  (e) => {
    const checks = require(`${__hooks}/lib/checks.js`)
    return e.json(
      200,
      checks.reopenPartsCheck(
        e.app,
        e.auth,
        e.request.pathValue('id'),
        require(`${__hooks}/lib/audit.js`).requestIp(e),
      ),
    )
  },
  $apis.requireAuth('users', '_superusers'),
)

// --- Record hooks -------------------------------------------------------------

// Release and completion are only set through the routes above (with their checks and audit).
// A new parts check blocks the first round unless the request says otherwise (M10-16).
onRecordCreateRequest(
  (e) => {
    require(`${__hooks}/lib/checks.js`).guardRequest(e, true)
    e.next()
  },
  'rounds',
  'schedule_blocks',
)

onRecordUpdateRequest(
  (e) => {
    require(`${__hooks}/lib/checks.js`).guardRequest(e, false)
    e.next()
  },
  'rounds',
  'schedule_blocks',
)

// The mode is fixed once a check was recorded (M10-09).
onRecordUpdate((e) => {
  require(`${__hooks}/lib/checks.js`).guardModeChange(e.app, e.record)
  e.next()
}, 'rounds')
