/// <reference path="../pb_data/types.d.ts" />

// M4: tables, time slots and the schedule of an event (docs/specifications/M4-tables-and-scheduling.md).

onRecordValidate((e) => {
  const start = Date.parse(e.record.getString('starts_at').replace(' ', 'T'))
  const end = Date.parse(e.record.getString('ends_at').replace(' ', 'T'))
  if (!(end > start)) {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    fieldError('ends_at', 'invalid_period', 'The end must be after the start.')
  }
  e.next()
}, 'time_slots')

// A table that still hosts scheduled games cannot be deactivated or deleted (M4-11).
onRecordUpdate((e) => {
  const { hasScheduledGames } = require(`${__hooks}/lib/schedule.js`)
  const wasActive = e.record.original().getBool('active')
  if (wasActive && !e.record.getBool('active') && hasScheduledGames(e.app, e.record.id)) {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    fieldError('active', 'table_in_use', 'Games are still scheduled on this table.')
  }
  e.next()
}, 'tables')

onRecordDelete((e) => {
  const { hasScheduledGames } = require(`${__hooks}/lib/schedule.js`)
  if (hasScheduledGames(e.app, e.record.id)) {
    throw new BadRequestError('Games are still scheduled on this table. Move them first.')
  }
  e.next()
}, 'tables')

// POST /api/events/{id}/schedule/generate  { dry_run? } -> placements (200) or the infeasibility report (409)
routerAdd(
  'POST',
  '/api/events/{id}/schedule/generate',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const schedule = require(`${__hooks}/lib/schedule.js`)
    const eventId = e.request.pathValue('id')
    if (!access.isVerifiedUser(e.auth) || !access.canManageEvent(e.app, e.auth, eventId)) {
      throw new ForbiddenError('Only event managers can generate schedules.')
    }
    const event = e.app.findRecordById('events', eventId)
    if (event.getString('status') === 'archived') {
      throw new BadRequestError('Archived events cannot be scheduled.')
    }
    const dryRun = !!e.requestInfo().body.dry_run
    const result = schedule.generate(e.app, eventId, dryRun)
    if (result.status === 'complete') return e.json(200, { ...result, dry_run: dryRun })
    return e.json(409, result)
  },
  $apis.requireAuth('users', '_superusers'),
)

// GET /api/events/{id}/schedule/validation -> every current schedule issue (M4-13)
routerAdd(
  'GET',
  '/api/events/{id}/schedule/validation',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const schedule = require(`${__hooks}/lib/schedule.js`)
    const eventId = e.request.pathValue('id')
    if (
      !access.isVerifiedUser(e.auth) ||
      !(
        access.isAdmin(e.app, e.auth) ||
        access.hasEventRole(e.app, e.auth, eventId, ['event_manager', 'head_judge', 'judge'])
      )
    ) {
      throw new ForbiddenError('Only event staff can view schedule validation.')
    }
    return e.json(200, { issues: schedule.validateEvent(e.app, eventId) })
  },
  $apis.requireAuth('users', '_superusers'),
)

// GET /api/events/{id}/judges -> [{ id, name }] of the judges of the event.
// Users and role assignments are not listable by staff, so the schedule reads names from here.
routerAdd(
  'GET',
  '/api/events/{id}/judges',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const eventId = e.request.pathValue('id')
    if (
      !access.isVerifiedUser(e.auth) ||
      !(
        access.isAdmin(e.app, e.auth) ||
        access.hasEventRole(e.app, e.auth, eventId, ['event_manager', 'head_judge', 'judge'])
      )
    ) {
      throw new ForbiddenError('Only event staff can list judges.')
    }
    const assignments = e.app.findRecordsByFilter(
      'role_assignments',
      'event = {:event} && (role = "judge" || role = "head_judge")',
      'created',
      0,
      0,
      { event: eventId },
    )
    const seen = {}
    const judges = []
    for (const assignment of assignments) {
      const id = assignment.getString('user')
      if (seen[id]) continue
      seen[id] = true
      judges.push({ id, name: e.app.findRecordById('users', id).getString('name') })
    }
    return e.json(200, judges)
  },
  $apis.requireAuth('users', '_superusers'),
)
