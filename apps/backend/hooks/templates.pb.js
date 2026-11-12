/// <reference path="../pb_data/types.d.ts" />

// M8-D: event setup checklist and event templates. See docs/specifications/M8-event-setup.md
// and hooks/lib/templates.js (file format).
//
// GET  /api/events/{id}/setup               -> { steps, complete }          managers, admins
// GET  /api/events/{id}/template            -> template file (JSON)          managers, admins
// POST /api/events/{id}/template            { name, description? }           admins: save to library
// POST /api/event-templates                 { content, name?, description? } admins: upload a file
// POST /api/event-templates/{id}/events     { name, first_day, season?, venue? } admins
// The library itself (list, rename, delete) is the `event_templates` record API.

routerAdd(
  'GET',
  '/api/events/{id}/setup',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const eventId = e.request.pathValue('id')
    if (!access.isVerifiedUser(e.auth) || !access.canManageEvent(e.app, e.auth, eventId)) {
      throw new ForbiddenError('Only event managers and admins can set up this event.', {
        _error: new ValidationError(
          'setup_not_allowed',
          'Only event managers and admins can set up this event.',
        ),
      })
    }
    try {
      e.app.findRecordById('events', eventId)
    } catch (_) {
      throw new NotFoundError('The event was not found.', {
        _error: new ValidationError('event_not_found', 'The event was not found.'),
      })
    }
    return e.json(200, require(`${__hooks}/lib/templates.js`).setupStatus(e.app, eventId))
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'GET',
  '/api/events/{id}/template',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const eventId = e.request.pathValue('id')
    if (!access.isVerifiedUser(e.auth) || !access.canManageEvent(e.app, e.auth, eventId)) {
      throw new ForbiddenError('Only event managers and admins can export this event.', {
        _error: new ValidationError(
          'template_not_allowed',
          'Only event managers and admins can export this event.',
        ),
      })
    }
    try {
      e.app.findRecordById('events', eventId)
    } catch (_) {
      throw new NotFoundError('The event was not found.', {
        _error: new ValidationError('event_not_found', 'The event was not found.'),
      })
    }
    return e.json(200, require(`${__hooks}/lib/templates.js`).exportEvent(e.app, eventId))
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/events/{id}/template',
  (e) => {
    const templates = require(`${__hooks}/lib/templates.js`)
    templates.requireAdmin(e)
    const eventId = e.request.pathValue('id')
    let event = null
    try {
      event = e.app.findRecordById('events', eventId)
    } catch (_) {
      throw new NotFoundError('The event was not found.', {
        _error: new ValidationError('event_not_found', 'The event was not found.'),
      })
    }
    const body = e.requestInfo().body || {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const template = templates.validate(
      templates.exportEvent(e.app, eventId, { name: name || event.getString('name'), description }),
    )
    const record = templates.save(e, template, {
      name: name || event.getString('name'),
      description,
      origin: `${event.getString('name')} (${event.getInt('season')})`,
      event: eventId,
    })
    return e.json(201, record)
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/event-templates',
  (e) => {
    const templates = require(`${__hooks}/lib/templates.js`)
    templates.requireAdmin(e)
    const body = e.requestInfo().body || {}
    const template = templates.parse(body.content)
    const record = templates.save(e, template, {
      name: typeof body.name === 'string' ? body.name.trim() : '',
      description: typeof body.description === 'string' ? body.description.trim() : '',
      origin: 'upload',
    })
    return e.json(201, record)
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/event-templates/{id}/events',
  (e) => {
    const templates = require(`${__hooks}/lib/templates.js`)
    templates.requireAdmin(e)
    let stored = null
    try {
      stored = e.app.findRecordById('event_templates', e.request.pathValue('id'))
    } catch (_) {
      throw new NotFoundError('The template was not found.', {
        _error: new ValidationError('template_not_found', 'The template was not found.'),
      })
    }
    const input = templates.eventInput(e.requestInfo().body || {})
    // Stored templates were validated on upload; checking again covers older stored formats.
    const template = templates.parse(JSON.parse(stored.getString('data')))
    let event = null
    e.app.runInTransaction((tx) => {
      event = templates.createEvent(tx, template, input, e.auth)
    })
    const audit = require(`${__hooks}/lib/audit.js`)
    audit.log(e.app, {
      auth: e.auth,
      action: 'template.create_event',
      collection: 'events',
      record: event.id,
      event: event.id,
      summary: `Created event “${event.getString('name')}” from template “${stored.getString('name')}”, first day ${input.first_day}`,
      changes: { template: stored.id, first_day: input.first_day },
      ip: audit.requestIp(e),
    })
    return e.json(201, event)
  },
  $apis.requireAuth('users', '_superusers'),
)
