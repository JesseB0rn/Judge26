/// <reference path="../pb_data/types.d.ts" />

// M4-14: multi-day schedule planner. See docs/specifications/M4-tables-and-scheduling.md.

// --- Day windows -------------------------------------------------------------

onRecordValidate((e) => {
  require(`${__hooks}/lib/planner.js`).validateDayWindow(e.record)
  e.next()
}, 'competition_days')

// M10-21: the planner edits day times with the version it loaded; a stale write gets 409. Other
// editors (the event's day list) send no version and are not checked.
onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/concurrency.js`).versionedUpdate(
    e,
    (body) => 'expected_updated' in body,
    'This day was changed by someone else. Reload and try again.',
  )
}, 'competition_days')

// --- Round phases ------------------------------------------------------------

onRecordValidate((e) => {
  require(`${__hooks}/lib/planner.js`).validatePhase(e.app, e.record)
  e.next()
}, 'round_phases')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/planner.js`).checkVersion(e, ['day', 'starts_at', 'duration_minutes'])
}, 'round_phases')

// Phases and rounds mirror each other (durations, scoring day). Both directions save only what
// differs, so a change settles after one round trip. Runs inside the saving transaction.
onRecordCreate((e) => {
  e.next()
  require(`${__hooks}/lib/planner.js`).syncRoundFromPhase(e.app, e.record)
}, 'round_phases')

onRecordUpdate((e) => {
  e.next()
  require(`${__hooks}/lib/planner.js`).syncRoundFromPhase(e.app, e.record)
}, 'round_phases')

onRecordCreate((e) => {
  const planner = require(`${__hooks}/lib/planner.js`)
  planner.defaultCheckMode(e.record)
  e.next()
  planner.syncPhasesFromRound(e.app, e.record)
}, 'rounds')

// Removing the robot check in the planner turns the round's check off (M10-08). Only API
// deletions: a round deleted with its phases is not saved again.
onRecordDeleteRequest((e) => {
  e.next()
  require(`${__hooks}/lib/planner.js`).checkRemoved(e.app, e.record)
}, 'round_phases')

onRecordUpdate((e) => {
  e.next()
  require(`${__hooks}/lib/planner.js`).syncPhasesFromRound(e.app, e.record)
}, 'rounds')

// --- Custom blocks -----------------------------------------------------------

onRecordValidate((e) => {
  require(`${__hooks}/lib/planner.js`).validateBlock(e.app, e.record)
  e.next()
}, 'schedule_blocks')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/planner.js`).checkVersion(e, [
    'day',
    'starts_at',
    'duration_minutes',
    'title',
    'place',
    'color',
    'responsibility',
    'categories',
    'columns',
    'public',
  ])
}, 'schedule_blocks')

// --- Custom columns (M4-14-33) -------------------------------------------------

// Only API deletions are checked, so deleting the event (cascade) still works.
onRecordDeleteRequest((e) => {
  require(`${__hooks}/lib/planner.js`).checkColumnDelete(e.app, e.record)
  e.next()
}, 'schedule_columns')

// --- Planner data ------------------------------------------------------------

// GET /api/events/{id}/planner -> days, categories, rounds, phases, blocks (+ issues for staff)
// Staff see internal blocks and issues; other users of a published event see public blocks only
// (M4-14-25). Archived events are staff only.
routerAdd(
  'GET',
  '/api/events/{id}/planner',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const planner = require(`${__hooks}/lib/planner.js`)
    const eventId = e.request.pathValue('id')
    if (!access.isVerifiedUser(e.auth))
      throw new ForbiddenError('Sign in to view the schedule.', {
        _error: new ValidationError('sign_in_required', 'Sign in to view the schedule.'),
      })
    let event = null
    try {
      event = e.app.findRecordById('events', eventId)
    } catch (_) {
      throw new NotFoundError('The event was not found.', {
        _error: new ValidationError('event_not_found', 'The event was not found.'),
      })
    }
    const staff =
      access.isAdmin(e.app, e.auth) ||
      access.hasEventRole(e.app, e.auth, eventId, ['event_manager', 'head_judge', 'judge'])
    const status = event.getString('status')
    if (!staff && status !== 'published') {
      throw new NotFoundError('The event was not found.', {
        _error: new ValidationError('event_not_found', 'The event was not found.'),
      })
    }
    return e.json(200, {
      ...planner.payload(e.app, eventId, staff),
      internal: staff,
      can_edit: access.canManageEvent(e.app, e.auth, eventId) && status !== 'archived',
    })
  },
  $apis.requireAuth('users', '_superusers'),
)
