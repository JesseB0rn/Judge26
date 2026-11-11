/// <reference path="../pb_data/types.d.ts" />

// Mail configuration and local mail capture.
//
// Production: configure SMTP via SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
// SMTP_TLS and MAIL_SENDER_ADDRESS / MAIL_SENDER_NAME. APP_URL sets the frontend URL
// used in email links.
//
// Development/test without SMTP: emails are not sent. They are logged and kept in
// memory, available via GET /api/dev/mails (non-production only).
//
// M7-01 – M7-04: application notifications go through the mail_outbox (hooks/lib/mail.js):
// queued with the change that caused them, delivered right away or by the job below, retried
// with backoff on failure. See docs/specifications/M7-communication.md.

onBootstrap((e) => {
  e.next()
  const env = (name) => $os.getenv(name)
  const settings = e.app.settings()
  let changed = false
  const set = (obj, key, value) => {
    if (value !== undefined && value !== '' && obj[key] !== value) {
      obj[key] = value
      changed = true
    }
  }
  set(settings.meta, 'appURL', env('APP_URL'))
  set(settings.meta, 'senderAddress', env('MAIL_SENDER_ADDRESS'))
  set(settings.meta, 'senderName', env('MAIL_SENDER_NAME'))
  if (env('SMTP_HOST')) {
    set(settings.smtp, 'enabled', true)
    set(settings.smtp, 'host', env('SMTP_HOST'))
    set(settings.smtp, 'port', parseInt(env('SMTP_PORT') || '587', 10))
    set(settings.smtp, 'username', env('SMTP_USERNAME'))
    set(settings.smtp, 'password', env('SMTP_PASSWORD'))
    set(settings.smtp, 'tls', env('SMTP_TLS') === 'true')
  }
  if (changed) e.app.save(settings)
})

onMailerSend((e) => {
  const env = $os.getenv('PB_ENV')
  const capture = (env === 'development' || env === 'test') && !e.app.settings().smtp.enabled
  if (!capture) return e.next()

  // M7-T12: simulated provider failures (POST /api/dev/mail-failures).
  const store0 = e.app.store()
  const failures = parseInt(store0.get('dev_mail_failures') || '0', 10)
  if (failures > 0) {
    store0.set('dev_mail_failures', String(failures - 1))
    throw new Error('Simulated mail provider failure')
  }

  const message = e.message
  const entry = {
    to: message.to.map((t) => t.address),
    subject: message.subject,
    html: message.html,
    sentAt: new Date().toISOString(),
  }
  const store = e.app.store()
  const mails = JSON.parse(store.get('dev_mails') || '[]')
  mails.push(entry)
  store.set('dev_mails', JSON.stringify(mails.slice(-200)))
  if (env === 'development') {
    console.log(`[dev mail] to=${entry.to.join(',')} subject="${entry.subject}"`)
    const link = /href="([^"]+)"/.exec(entry.html)
    if (link) console.log(`[dev mail] link: ${link[1]}`)
  }
  // Do not call e.next(): the message is not actually sent.
})

const mailEnv = $os.getenv('PB_ENV')
if (mailEnv === 'development' || mailEnv === 'test') {
  // GET /api/dev/mails?to=<address>  -> captured messages, newest last
  routerAdd('GET', '/api/dev/mails', (e) => {
    const to = e.request.url.query().get('to')
    const mails = JSON.parse(e.app.store().get('dev_mails') || '[]')
    return e.json(200, to ? mails.filter((m) => m.to.indexOf(to) !== -1) : mails)
  })

  // POST /api/dev/mail-failures { count } -> the next `count` sends fail (M7-T12)
  routerAdd('POST', '/api/dev/mail-failures', (e) => {
    const count = parseInt(e.requestInfo().body.count || 0, 10)
    e.app.store().set('dev_mail_failures', String(Math.max(0, count)))
    return e.json(200, { count })
  })

  // POST /api/dev/mail-outbox/process { now? } -> runs the delivery job immediately. `now`
  // (ms) makes messages that are due by then due now, to test retries without waiting.
  routerAdd('POST', '/api/dev/mail-outbox/process', (e) => {
    const mail = require(`${__hooks}/lib/mail.js`)
    const now = parseInt(e.requestInfo().body.now || 0, 10)
    if (now > Date.now()) {
      const iso = (ms) => new Date(ms).toISOString().replace('T', ' ')
      e.app
        .db()
        .newQuery(
          "UPDATE mail_outbox SET next_attempt_at = {:current} WHERE status = 'pending' AND next_attempt_at <= {:until}",
        )
        .bind({ current: iso(Date.now()), until: iso(now) })
        .execute()
    }
    return e.json(200, mail.processDue(e.app, 500))
  })
}

// ---------------------------------------------------------------------------
// Outbox delivery (M7-01)
// ---------------------------------------------------------------------------

// Single notifications (e.g. a registration) are sent as soon as they are committed.
onRecordAfterCreateSuccess((e) => {
  if (e.record.getBool('immediate')) {
    try {
      require(`${__hooks}/lib/mail.js`).deliver(e.app, e.record.id)
    } catch (err) {
      e.app.logger().error('Mail delivery crashed', 'outbox', e.record.id, 'error', String(err))
    }
  }
  e.next()
}, 'mail_outbox')

// Everything else, and every retry, is sent by this job.
cronAdd('mail_outbox', '* * * * *', () => {
  require(`${__hooks}/lib/mail.js`).processDue($app, 200)
})

// POST /api/mail/outbox/{id}/retry -> queues a failed message again and tries to send it
routerAdd(
  'POST',
  '/api/mail/outbox/{id}/retry',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const mail = require(`${__hooks}/lib/mail.js`)
    let record
    try {
      record = e.app.findRecordById('mail_outbox', e.request.pathValue('id'))
    } catch (_) {
      throw new NotFoundError('Message not found.')
    }
    const eventId = record.getString('event')
    const allowed =
      access.isVerifiedUser(e.auth) &&
      (access.isAdmin(e.app, e.auth) || (eventId && access.canManageEvent(e.app, e.auth, eventId)))
    if (!allowed) throw new ForbiddenError('Only admins and event managers can retry messages.')
    mail.retry(e.app, record.id)
    const audit = require(`${__hooks}/lib/audit.js`)
    audit.log(e.app, {
      auth: e.auth,
      action: 'mail.retry',
      collection: 'mail_outbox',
      record: record.id,
      event: eventId,
      summary: `Retried email “${record.getString('subject')}” to ${record.getString('to')}`,
      ip: audit.requestIp(e),
    })
    mail.deliver(e.app, record.id)
    return e.json(200, e.app.findRecordById('mail_outbox', record.id).publicExport())
  },
  $apis.requireAuth('users', '_superusers'),
)

// ---------------------------------------------------------------------------
// Templates (M7-02)
// ---------------------------------------------------------------------------

// GET /api/mail/templates/variables -> { key: [variable, ...] }
routerAdd(
  'GET',
  '/api/mail/templates/variables',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    if (!access.isVerifiedUser(e.auth) || !access.isAdmin(e.app, e.auth)) {
      throw new ForbiddenError('Only admins can edit email templates.')
    }
    return e.json(200, require(`${__hooks}/lib/mail.js`).TEMPLATE_VARIABLES)
  },
  $apis.requireAuth('users', '_superusers'),
)

// Only known template keys, and only the variables each template provides.
onRecordValidate((e) => {
  const mail = require(`${__hooks}/lib/mail.js`)
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const key = e.record.getString('key')
  if (!mail.TEMPLATE_VARIABLES[key]) fieldError('key', 'unknown_template', 'Unknown template.')
  ;['subject', 'body'].forEach((field) => {
    const unknown = mail.unknownVariables(key, e.record.getString(field))
    if (unknown.length) {
      fieldError(
        field,
        'unknown_variable',
        `Unknown variable${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Available: ${mail.TEMPLATE_VARIABLES[key].join(', ')}.`,
      )
    }
  })
  e.next()
}, 'mail_templates')

// ---------------------------------------------------------------------------
// Registration notifications (M7-03)
// ---------------------------------------------------------------------------

// The coach is emailed when a registration is submitted, approved or rejected. Queued in the
// same transaction as the status change; a failure to queue never blocks the registration.
onRecordCreate((e) => {
  e.next()
  require(`${__hooks}/lib/mail.js`).onTeamSaved(e, '')
}, 'teams')

onRecordUpdate((e) => {
  const from = e.record.original().getString('status')
  e.next()
  require(`${__hooks}/lib/mail.js`).onTeamSaved(e, from)
}, 'teams')

// ---------------------------------------------------------------------------
// Schedule notifications (M7-04)
// ---------------------------------------------------------------------------

// GET /api/events/{id}/notifications/schedule -> every approved team's schedule and whether it
// changed since the coach was last notified
routerAdd(
  'GET',
  '/api/events/{id}/notifications/schedule',
  (e) => {
    const mail = require(`${__hooks}/lib/mail.js`)
    const event = mail.requireScheduleNotifier(e)
    const changes = mail.scheduleChanges(e.app, event.id).map(mail.serializeChange)
    return e.json(200, { teams: changes, changed: changes.filter((c) => c.changed).length })
  },
  $apis.requireAuth('users', '_superusers'),
)

// POST /api/events/{id}/notifications/schedule { scope: "changed" | "all", message? } -> { queued }
routerAdd(
  'POST',
  '/api/events/{id}/notifications/schedule',
  (e) => {
    const mail = require(`${__hooks}/lib/mail.js`)
    const event = mail.requireScheduleNotifier(e)
    if (event.getString('status') === 'archived') {
      throw new BadRequestError('Archived events are read-only.')
    }
    const body = e.requestInfo().body
    const scope = body.scope || 'changed'
    if (scope !== 'changed' && scope !== 'all') {
      const { fieldError } = require(`${__hooks}/lib/errors.js`)
      fieldError('scope', 'invalid_scope', 'Scope must be "changed" or "all".')
    }
    const message = String(body.message || '').slice(0, 2000)
    let queued = 0
    e.app.runInTransaction((tx) => {
      const changes = mail
        .scheduleChanges(tx, event.id)
        .filter((c) => (scope === 'all' ? c.entry.items.length > 0 || c.notice : c.changed))
      queued = mail.notifySchedule(tx, event.id, changes, message)
    })
    const audit = require(`${__hooks}/lib/audit.js`)
    audit.log(e.app, {
      auth: e.auth,
      action: 'notifications.schedule',
      collection: 'events',
      record: event.id,
      event: event.id,
      summary: `Sent schedule emails to ${queued} team${queued === 1 ? '' : 's'} (${scope})`,
      changes: { scope, queued, message },
      ip: audit.requestIp(e),
    })
    return e.json(200, { queued })
  },
  $apis.requireAuth('users', '_superusers'),
)
