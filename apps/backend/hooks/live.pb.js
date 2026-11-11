/// <reference path="../pb_data/types.d.ts" />

// M6: live competition and public interface. See docs/specifications/M6-live.md.

// --- Revision signal -------------------------------------------------------
// Every committed change to data shown on public displays increases the event's revision.
// "After success" hooks run after the surrounding transaction has committed, so displays never
// reload before the change is visible. `$app` is used because the hook may run after the
// transaction app that saved the record is finished.

const LIVE_COLLECTIONS = [
  'events',
  'categories',
  'teams',
  'tables',
  'competition_days',
  'rounds',
  'games',
  'ranking_snapshots',
  'round_phases',
  'schedule_blocks',
  'schedule_columns',
]

onRecordAfterCreateSuccess(
  (e) => {
    require(`${__hooks}/lib/live.js`).touch($app, e.record.collection().name, e.record)
    e.next()
  },
  ...LIVE_COLLECTIONS,
)

onRecordAfterUpdateSuccess(
  (e) => {
    require(`${__hooks}/lib/live.js`).touch($app, e.record.collection().name, e.record)
    e.next()
  },
  ...LIVE_COLLECTIONS,
)

onRecordAfterDeleteSuccess(
  (e) => {
    if (e.record.collection().name !== 'events') {
      require(`${__hooks}/lib/live.js`).touch($app, e.record.collection().name, e.record)
    }
    e.next()
  },
  ...LIVE_COLLECTIONS,
)

// Score sheets: a new sheet means "being scored"; later autosaves of a draft change nothing
// public, so only status changes beyond draft are signalled.
onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/lib/live.js`).touch($app, 'score_sheets', e.record)
  e.next()
}, 'score_sheets')

onRecordAfterUpdateSuccess((e) => {
  if (e.record.getString('status') !== 'draft') {
    require(`${__hooks}/lib/live.js`).touch($app, 'score_sheets', e.record)
  }
  e.next()
}, 'score_sheets')

// --- Publication (M6-10) ---------------------------------------------------

onRecordValidate((e) => {
  require(`${__hooks}/lib/live.js`).validatePublication(e.app, e.record)
  e.next()
}, 'categories')

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/live.js`).stampPublication(e.record, e.auth, null)
  e.next()
}, 'categories')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/live.js`).stampPublication(e.record, e.auth, e.record.original())
  e.next()
}, 'categories')

// --- Public API (no authentication) -----------------------------------------

// GET /api/public/events -> published and archived events with their days
routerAdd('GET', '/api/public/events', (e) => {
  return e.json(200, require(`${__hooks}/lib/live.js`).listEvents(e.app))
})

// GET /api/public/events/{id} -> schedule, progress and publication state (M6-04, M6-08)
routerAdd('GET', '/api/public/events/{id}', (e) => {
  const live = require(`${__hooks}/lib/live.js`)
  return e.json(200, live.eventPayload(e.app, e.request.pathValue('id')))
})

// GET /api/public/categories/{id}/ranking -> published official and live rankings (M6-03)
routerAdd('GET', '/api/public/categories/{id}/ranking', (e) => {
  const live = require(`${__hooks}/lib/live.js`)
  return e.json(200, live.rankingPayload(e.app, e.request.pathValue('id')))
})
