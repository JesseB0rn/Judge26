/// <reference path="../pb_data/types.d.ts" />

// M10-31 – M10-34: print center. See docs/specifications/M10-setup-print-live.md.

// GET /api/events/{id}/print -> teams, rounds with phases, tables with judges (staff)
routerAdd(
  'GET',
  '/api/events/{id}/print',
  (e) => {
    const print = require(`${__hooks}/lib/print.js`)
    return e.json(200, print.printData(e.app, e.auth, e.request.pathValue('id')))
  },
  $apis.requireAuth('users', '_superusers'),
)
