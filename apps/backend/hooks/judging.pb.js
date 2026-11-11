/// <reference path="../pb_data/types.d.ts" />

// M5: judge interface and scoring workflow. See docs/specifications/M5-judging.md.

// GET /api/judging/assignments -> games on the tables the user judges (M5-01)
routerAdd(
  'GET',
  '/api/judging/assignments',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    if (!access.isVerifiedUser(e.auth)) throw new ForbiddenError('Verify your account first.')
    return e.json(200, require(`${__hooks}/lib/judging.js`).assignments(e.app, e.auth))
  },
  $apis.requireAuth('users', '_superusers'),
)

// GET /api/events/{id}/judging -> all games of the event with their score status (reviewers)
routerAdd(
  'GET',
  '/api/events/{id}/judging',
  (e) => {
    const judging = require(`${__hooks}/lib/judging.js`)
    return e.json(200, judging.eventGames(e.app, e.auth, e.request.pathValue('id')))
  },
  $apis.requireAuth('users', '_superusers'),
)

// GET /api/games/{id}/sheet -> game context, ruleset, score sheet, history, permissions
routerAdd(
  'GET',
  '/api/games/{id}/sheet',
  (e) => {
    const judging = require(`${__hooks}/lib/judging.js`)
    return e.json(200, judging.sheetPayload(e.app, e.auth, e.request.pathValue('id')))
  },
  $apis.requireAuth('users', '_superusers'),
)

// PUT /api/games/{id}/sheet { outcome, values, time_ms, points?, client_saved_at } -> draft
routerAdd(
  'PUT',
  '/api/games/{id}/sheet',
  (e) => {
    const judging = require(`${__hooks}/lib/judging.js`)
    const body = e.requestInfo().body || {}
    return e.json(200, judging.saveDraft(e.app, e.auth, e.request.pathValue('id'), body))
  },
  $apis.requireAuth('users', '_superusers'),
)

// POST /api/games/{id}/sheet/{action} with action = submit | approve | reject | correct
routerAdd(
  'POST',
  '/api/games/{id}/sheet/{action}',
  (e) => {
    const judging = require(`${__hooks}/lib/judging.js`)
    const id = e.request.pathValue('id')
    const body = e.requestInfo().body || {}
    switch (e.request.pathValue('action')) {
      case 'submit':
        return e.json(200, judging.submit(e.app, e.auth, id, body))
      case 'approve':
        return e.json(200, judging.approve(e.app, e.auth, id))
      case 'reject':
        return e.json(200, judging.reject(e.app, e.auth, id, body))
      case 'correct': {
        const result = judging.correct(e.app, e.auth, id, body)
        const audit = require(`${__hooks}/lib/audit.js`)
        const game = e.app.findRecordById('games', id)
        audit.log(e.app, {
          auth: e.auth,
          action: 'score.correct',
          collection: 'games',
          record: id,
          event: audit.eventOf(e.app, 'games', game),
          summary: `Corrected a finalized score: ${body.reason || ''}`,
          changes: { points: game.getFloat('points'), time_ms: game.getInt('time_ms') },
          ip: audit.requestIp(e),
        })
        return e.json(200, result)
      }
      default:
        throw new NotFoundError('Unknown action.')
    }
  },
  $apis.requireAuth('users', '_superusers'),
)

// Results owned by the judging workflow cannot be edited directly; other direct result edits
// (M3 result form) are audited (M5-13).
onRecordUpdateRequest((e) => {
  const judging = require(`${__hooks}/lib/judging.js`)
  const body = e.requestInfo().body || {}
  if (!judging.guardDirectEdit(e.app, e.record.id, body)) return e.next()
  const before = judging.snapshot(e.app.findRecordById('games', e.record.id))
  e.next()
  const after = judging.snapshot(e.record)
  if (judging.changed(before, after)) {
    judging.audit(e.app, e.record.id, 'manual_edit', e.auth, { before, after })
  }
}, 'games')

onRecordCreateRequest((e) => {
  e.next()
  if (e.record.getString('status') !== 'scheduled') {
    const judging = require(`${__hooks}/lib/judging.js`)
    judging.audit(e.app, e.record.id, 'manual_edit', e.auth, {
      before: null,
      after: judging.snapshot(e.record),
    })
  }
}, 'games')

onRecordDeleteRequest((e) => {
  const sheet = require(`${__hooks}/lib/judging.js`).sheetFor(e.app, e.record.id)
  if (sheet && ['submitted', 'finalized'].includes(sheet.getString('status'))) {
    throw new BadRequestError('Games with a submitted or finalized score cannot be deleted.')
  }
  e.next()
}, 'games')

// The audit trail is append-only, even for superusers.
onRecordUpdate((e) => {
  throw new BadRequestError('Score audit entries cannot be changed.')
}, 'score_audit')

// A round's day must be a competition day of the round's event (M5-02).
onRecordValidate((e) => {
  const dayId = e.record.getString('day')
  if (dayId) {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    const category = e.app.findRecordById('categories', e.record.getString('category'))
    let day = null
    try {
      day = e.app.findRecordById('competition_days', dayId)
    } catch (_) {
      day = null
    }
    if (!day || day.getString('event') !== category.getString('event')) {
      fieldError('day', 'invalid_day', 'Choose a competition day of this event.')
    }
  }
  e.next()
}, 'rounds')
