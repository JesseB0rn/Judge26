/// <reference path="../pb_data/types.d.ts" />

// M5: each table has one event judge; game order is stored per round and table.
onRecordValidate((e) => {
  const judgeId = e.record.getString('judge')
  if (judgeId) {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    const access = require(`${__hooks}/lib/access.js`)
    const eventId = e.record.getString('event')
    if (!access.hasEventRole(e.app, { id: judgeId }, eventId, ['judge', 'head_judge'])) {
      fieldError('judge', 'invalid_judge', 'The assigned judge must be staff of this event.')
    }
  }
  e.next()
}, 'tables')

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

// POST /api/events/{id}/schedule/generate  { dry_run? } -> table sequences (200) or a report (409)
routerAdd(
  'POST',
  '/api/events/{id}/schedule/generate',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const schedule = require(`${__hooks}/lib/schedule.js`)
    const eventId = e.request.pathValue('id')
    if (!access.isVerifiedUser(e.auth) || !access.canManageEvent(e.app, e.auth, eventId)) {
      throw new ForbiddenError('Only event managers and admins can generate schedules.')
    }
    const event = e.app.findRecordById('events', eventId)
    if (event.getString('status') === 'archived') {
      throw new BadRequestError('Archived events cannot be scheduled.')
    }
    const dryRun = !!e.requestInfo().body.dry_run
    const result = schedule.generate(e.app, eventId, dryRun)
    if (!dryRun && result.status === 'complete') {
      const audit = require(`${__hooks}/lib/audit.js`)
      audit.log(e.app, {
        auth: e.auth,
        action: 'schedule.generate',
        collection: 'events',
        record: eventId,
        event: eventId,
        summary: 'Generated the schedule',
        ip: audit.requestIp(e),
      })
    }
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
    const planner = require(`${__hooks}/lib/planner.js`)
    return e.json(200, {
      issues: schedule.validateEvent(e.app, eventId),
      // Timing warnings of the schedule planner (M4-14-20 – M4-14-24).
      planner_issues: planner.eventIssues(e.app, eventId),
    })
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

// GET /api/users/{id}/schedule -> the authenticated user's scheduled games.
routerAdd(
  'GET',
  '/api/users/{id}/schedule',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const userId = e.request.pathValue('id')
    if (!access.isVerifiedUser(e.auth) || e.auth.id !== userId) {
      throw new ForbiddenError('Users can only view their own schedule.')
    }

    const planner = require(`${__hooks}/lib/planner.js`)
    const dayInfo = (id) => {
      if (!id) return null
      try {
        const day = e.app.findRecordById('competition_days', id)
        return { id: day.id, date: day.getString('date'), label: day.getString('label') }
      } catch (_) {
        return null
      }
    }
    const scheduledGames = []
    const teams = e.app.findRecordsByFilter('teams', 'coach = {:coach}', 'created', 0, 0, {
      coach: userId,
    })
    for (const team of teams) {
      const games = e.app.findRecordsByFilter(
        'games',
        'team = {:team} && table != "" && sequence > 0',
        'round,table,sequence',
        0,
        0,
        { team: team.id },
      )
      for (const game of games) {
        const round = e.app.findRecordById('rounds', game.getString('round'))
        const table = e.app.findRecordById('tables', game.getString('table'))
        scheduledGames.push({
          id: game.id,
          team: team.id,
          round: round.id,
          table: table.id,
          sequence: game.getInt('sequence'),
          expand: {
            team: { id: team.id, name: team.getString('name') },
            round: {
              id: round.id,
              name: round.getString('name'),
              position: round.getInt('position'),
              // Scoring start from the schedule planner (M4-14-30).
              starts_at: planner.scoringStart(e.app, round.id),
              day: dayInfo(round.getString('day')),
            },
            table: { id: table.id, name: table.getString('name') },
          },
        })
      }
    }
    scheduledGames.sort(
      (a, b) =>
        a.expand.round.position - b.expand.round.position ||
        a.expand.table.name.localeCompare(b.expand.table.name) ||
        a.sequence - b.sequence,
    )
    return e.json(200, scheduledGames)
  },
  $apis.requireAuth('users', '_superusers'),
)
