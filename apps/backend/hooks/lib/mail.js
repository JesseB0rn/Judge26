/// <reference path="../../pb_data/types.d.ts" />

// M7-01 – M7-04: transactional email through an outbox with retries.
// See docs/specifications/M7-communication.md.
//
// enqueue() renders a template into a mail_outbox record inside the caller's transaction, so a
// notification exists exactly when the change that caused it was committed. deliver() sends one
// queued message; failures are recorded and retried with backoff until MAX_ATTEMPTS.

/** Minutes to wait after the 1st, 2nd, ... failed attempt. */
const BACKOFF_MINUTES = [1, 5, 15, 60]
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1
/** A message being delivered is leased for this long, so two workers never send it twice. */
const LEASE_MS = 2 * 60 * 1000

/**
 * Variables of each template. Values are HTML-escaped in the body, except RAW ones, which the
 * server renders itself.
 */
const TEMPLATE_VARIABLES = {
  // Registration templates (M7-03) are disabled since M8-A; kept so stored records validate.
  registration_submitted: ['coach_name', 'team_name', 'category_name', 'event_name', 'team_url'],
  registration_approved: [
    'coach_name',
    'team_name',
    'category_name',
    'event_name',
    'team_url',
    'review_note',
  ],
  registration_rejected: [
    'coach_name',
    'team_name',
    'category_name',
    'event_name',
    'team_url',
    'review_note',
  ],
  schedule_changed: [
    'contact_name',
    'team_name',
    'event_name',
    'schedule',
    'schedule_text',
    'message',
    'schedule_url',
  ],
  // Judge invitations (M8-B, hooks/lib/invitations.js).
  invitation: [
    'name',
    'event_name',
    'role_name',
    'inviter_name',
    'action_url',
    'expires_on',
    'app_name',
  ],
  event_access: ['name', 'event_name', 'role_name', 'inviter_name', 'action_url', 'app_name'],
  // Account emails sent by PocketBase (hooks/mail.pb.js renders them in the user's language).
  auth_verification: ['name', 'action_url', 'app_name'],
  auth_password_reset: ['name', 'action_url', 'app_name'],
}
const RAW = ['schedule']
/**
 * Former variable names, still accepted and rendered but no longer offered: templates saved
 * before M8-A (and the migrations that create them) use `coach_name`.
 */
const ALIASES = { schedule_changed: { coach_name: 'contact_name' } }

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Replaces {{name}} placeholders. `html` escapes values (except RAW ones). */
function render(text, vars, html) {
  return String(text || '').replace(PLACEHOLDER, (_, name) => {
    const value = vars[name] === undefined || vars[name] === null ? '' : String(vars[name])
    return html && RAW.indexOf(name) === -1 ? escapeHtml(value) : value
  })
}

/** Placeholders used in a template that the template does not provide. */
function unknownVariables(key, text) {
  const allowed = (TEMPLATE_VARIABLES[key] || []).concat(Object.keys(ALIASES[key] || {}))
  const unknown = []
  String(text || '').replace(PLACEHOLDER, (_, name) => {
    if (allowed.indexOf(name) === -1 && unknown.indexOf(name) === -1) unknown.push(name)
    return ''
  })
  return unknown
}

/** PocketBase's stored date format ("2006-01-02 15:04:05.000Z"), comparable as text. */
function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ')
}

function appUrl(app) {
  return String(app.settings().meta.appURL || '').replace(/\/+$/, '')
}

/** The template in `language`, else the English one (null if neither exists). */
function findTemplate(app, key, language) {
  const find = (lang) => {
    try {
      return app.findFirstRecordByFilter('mail_templates', 'key = {:key} && language = {:lang}', {
        key,
        lang,
      })
    } catch (_) {
      return null
    }
  }
  const i18n = require(`${__hooks}/lib/i18n.js`)
  return find(i18n.language(language)) || find(i18n.FALLBACK)
}

/**
 * Queues a message from a template in `options.language` (the recipient's). Returns the outbox
 * record, or null if the template is disabled or missing or there is no recipient.
 */
function enqueue(app, options) {
  const template = findTemplate(app, options.template, options.language)
  if (!template || !template.getBool('enabled') || !options.to) return null
  const vars = Object.assign({}, options.vars)
  const aliases = ALIASES[options.template] || {}
  Object.keys(aliases).forEach((alias) => (vars[alias] = vars[aliases[alias]]))
  const record = new Record(app.findCollectionByNameOrId('mail_outbox'))
  record.set('template', options.template)
  record.set('to', options.to)
  // Subjects are plain text; line breaks would break the mail header.
  record.set(
    'subject',
    render(template.getString('subject'), vars, false).replace(/\s+/g, ' ').trim(),
  )
  record.set('html', render(template.getString('body'), vars, true))
  record.set('status', 'pending')
  record.set('attempts', 0)
  record.set('next_attempt_at', pbDate(Date.now()))
  record.set('immediate', !!options.immediate)
  if (options.event) record.set('event', options.event)
  if (options.team) record.set('team', options.team)
  app.save(record)
  return record
}

/** Atomically takes a due pending message, so concurrent workers never send it twice. */
function claim(app, id) {
  const now = Date.now()
  const result = app
    .db()
    .newQuery(
      "UPDATE mail_outbox SET next_attempt_at = {:lease} WHERE id = {:id} AND status = 'pending' AND next_attempt_at <= {:now}",
    )
    .bind({ id, now: pbDate(now), lease: pbDate(now + LEASE_MS) })
    .execute()
  return result.rowsAffected() === 1
}

function errorMessage(err) {
  const text = err && err.message ? err.message : String(err)
  return text.slice(0, 2000)
}

/** Sends one queued message. Returns its new status. */
function deliver(app, id) {
  if (!claim(app, id)) return null
  const record = app.findRecordById('mail_outbox', id)
  const settings = app.settings()
  const attempts = record.getInt('attempts') + 1
  record.set('attempts', attempts)
  try {
    const message = new MailerMessage({
      from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
      to: [{ address: record.getString('to') }],
      subject: record.getString('subject'),
      html: record.getString('html'),
    })
    app.newMailClient().send(message)
    record.set('status', 'sent')
    record.set('sent_at', pbDate(Date.now()))
    record.set('last_error', '')
  } catch (err) {
    record.set('last_error', errorMessage(err))
    if (attempts >= MAX_ATTEMPTS) {
      record.set('status', 'failed')
    } else {
      record.set('next_attempt_at', pbDate(Date.now() + BACKOFF_MINUTES[attempts - 1] * 60000))
    }
    app
      .logger()
      .warn(
        'Mail delivery failed',
        'outbox',
        id,
        'attempt',
        attempts,
        'error',
        record.getString('last_error'),
      )
  }
  app.save(record)
  return record.getString('status')
}

/** Delivers due pending messages (oldest first). Returns counts by resulting status. */
function processDue(app, limit) {
  const due = app.findRecordsByFilter(
    'mail_outbox',
    'status = "pending" && next_attempt_at <= {:now}',
    'next_attempt_at',
    limit || 50,
    0,
    { now: pbDate(Date.now()) },
  )
  const counts = { sent: 0, pending: 0, failed: 0 }
  due.forEach((record) => {
    const status = deliver(app, record.id)
    if (status) counts[status]++
  })
  return counts
}

/** Puts a failed message back into the queue (admins and the event's managers). */
function retry(app, id) {
  const record = app.findRecordById('mail_outbox', id)
  if (record.getString('status') !== 'failed') {
    throw new BadRequestError('Only failed messages can be retried.', {
      _error: new ValidationError('retry_failed_only', 'Only failed messages can be retried.'),
    })
  }
  record.set('status', 'pending')
  record.set('attempts', 0)
  record.set('next_attempt_at', pbDate(Date.now()))
  app.save(record)
  return record
}

/** Language of a team's contact: that of the account with the contact email, if any. */
function contactLanguage(app, team) {
  return require(`${__hooks}/lib/i18n.js`).languageOf(app, { email: team.getString('coach_email') })
}

// ---------------------------------------------------------------------------
// Schedule notifications (M7-04)
// ---------------------------------------------------------------------------

/** Route guard: event managers and admins of the event in the path. Returns the event. */
function requireScheduleNotifier(e) {
  const access = require(`${__hooks}/lib/access.js`)
  const eventId = e.request.pathValue('id')
  if (!access.isVerifiedUser(e.auth) || !access.canManageEvent(e.app, e.auth, eventId)) {
    throw new ForbiddenError('Only event managers and admins can notify teams.', {
      _error: new ValidationError(
        'managers_only',
        'Only event managers and admins can notify teams.',
      ),
    })
  }
  try {
    return e.app.findRecordById('events', eventId)
  } catch (_) {
    throw new NotFoundError('Event not found.', {
      _error: new ValidationError('event_not_found', 'Event not found.'),
    })
  }
}

function phaseOf(phases, roundId, phase) {
  return phases.filter((p) => p.round === roundId && p.phase === phase)[0] || null
}

/**
 * The schedule of every approved team of an event, as its contact would be told about it: per game
 * the round, day, scoring start, table and position, plus the round's robot check.
 */
function eventSchedules(app, eventId) {
  const params = { e: eventId }
  const byId = (records) => {
    const map = {}
    records.forEach((r) => (map[r.id] = r))
    return map
  }
  const days = byId(app.findRecordsByFilter('competition_days', 'event = {:e}', '', 0, 0, params))
  const rounds = byId(app.findRecordsByFilter('rounds', 'category.event = {:e}', '', 0, 0, params))
  const tables = byId(app.findRecordsByFilter('tables', 'event = {:e}', '', 0, 0, params))
  const phases = app
    .findRecordsByFilter('round_phases', 'round.category.event = {:e}', '', 0, 0, params)
    .map((p) => ({
      round: p.getString('round'),
      phase: p.getString('phase'),
      day: days[p.getString('day')] || null,
      starts_at: p.getString('starts_at'),
    }))
  const teams = app.findRecordsByFilter(
    'teams',
    'event = {:e} && status = "approved"',
    'name',
    0,
    0,
    params,
  )
  const gamesByTeam = {}
  app
    .findRecordsByFilter('games', 'team.event = {:e} && status = "scheduled"', '', 0, 0, params)
    .forEach((g) => {
      const list = (gamesByTeam[g.getString('team')] = gamesByTeam[g.getString('team')] || [])
      list.push(g)
    })

  const dayInfo = (day) =>
    day ? { date: day.getString('date').slice(0, 10), label: day.getString('label') } : null

  return teams.map((team) => {
    const items = (gamesByTeam[team.id] || [])
      .map((game) => {
        const round = rounds[game.getString('round')]
        const scoring = round ? phaseOf(phases, round.id, 'scoring') : null
        const check = round ? phaseOf(phases, round.id, 'check') : null
        const table = tables[game.getString('table')]
        return {
          round: round ? round.getString('name') : '',
          round_position: round ? round.getInt('position') : 0,
          attempt: game.getInt('attempt') || 1,
          day: scoring ? dayInfo(scoring.day) : null,
          starts_at: scoring && scoring.day ? scoring.starts_at : '',
          table: table ? table.getString('name') : '',
          sequence: game.getString('table') ? game.getInt('sequence') : 0,
          check:
            check && check.day ? { day: dayInfo(check.day), starts_at: check.starts_at } : null,
        }
      })
      .sort(
        (a, b) =>
          ((a.day && a.day.date) || '9').localeCompare((b.day && b.day.date) || '9') ||
          (a.starts_at || '99').localeCompare(b.starts_at || '99') ||
          a.round_position - b.round_position ||
          a.attempt - b.attempt,
      )
    return {
      team,
      items,
      fingerprint: $security.sha256(JSON.stringify(items)),
    }
  })
}

/** One game of a schedule as a line of text in `language` (default English). */
function describeItem(item, language) {
  const t = require(`${__hooks}/lib/i18n.js`).t
  const lang = language || 'en'
  const parts = [
    item.attempt > 1
      ? t(lang, 'attempt', { round: item.round, attempt: item.attempt })
      : item.round,
  ]
  if (item.day) parts.push(item.day.label || item.day.date)
  if (item.starts_at) parts.push(t(lang, 'from', { time: item.starts_at }))
  parts.push(
    item.table
      ? t(lang, 'table', { table: item.table, position: item.sequence })
      : t(lang, 'noTable'),
  )
  if (item.check) {
    const day = item.check.day.label || item.check.day.date
    parts.push(
      t(lang, 'check', { day: `${day}${item.check.starts_at ? ` ${item.check.starts_at}` : ''}` }),
    )
  }
  return parts.join(' · ')
}

function scheduleHtml(items, language) {
  const t = require(`${__hooks}/lib/i18n.js`).t
  if (!items.length) return `<p><em>${escapeHtml(t(language, 'noGames'))}</em></p>`
  return `<ul>${items.map((i) => `<li>${escapeHtml(describeItem(i, language))}</li>`).join('')}</ul>`
}

function scheduleText(items, language) {
  const t = require(`${__hooks}/lib/i18n.js`).t
  if (!items.length) return t(language, 'noGames')
  return items.map((i) => `- ${describeItem(i, language)}`).join('\n')
}

function noticeFor(app, teamId) {
  try {
    return app.findFirstRecordByFilter('schedule_notices', 'team = {:t}', { t: teamId })
  } catch (_) {
    return null
  }
}

/**
 * Teams whose schedule differs from what their contact was last told. A team that was never
 * notified is affected once it has a schedule.
 */
function scheduleChanges(app, eventId) {
  return eventSchedules(app, eventId).map((entry) => {
    const notice = noticeFor(app, entry.team.id)
    const notified = notice ? notice.getString('fingerprint') : ''
    const changed = notice ? notified !== entry.fingerprint : entry.items.length > 0
    return {
      entry,
      notice,
      changed,
      notified_at: notice ? notice.getString('notified_at') : '',
    }
  })
}

function serializeChange(change) {
  const team = change.entry.team
  return {
    team: { id: team.id, name: team.getString('name'), category: team.getString('category') },
    contact_email: team.getString('coach_email'),
    changed: change.changed,
    notified_at: change.notified_at,
    items: change.entry.items.map((i) => ({ ...i, text: describeItem(i) })),
  }
}

/**
 * Queues schedule emails for the given changes and records what each contact was told. Teams
 * without a contact email are skipped and stay "changed".
 */
function notifySchedule(app, eventId, changes, message) {
  const event = app.findRecordById('events', eventId)
  const notices = app.findCollectionByNameOrId('schedule_notices')
  let queued = 0
  changes.forEach((change) => {
    const team = change.entry.team
    const language = contactLanguage(app, team)
    const record = enqueue(app, {
      template: 'schedule_changed',
      to: team.getString('coach_email'),
      event: eventId,
      team: team.id,
      language,
      vars: {
        contact_name:
          team.getString('coach_name') || require(`${__hooks}/lib/i18n.js`).t(language, 'contact'),
        team_name: team.getString('name'),
        event_name: event.getString('name'),
        schedule: scheduleHtml(change.entry.items, language),
        schedule_text: scheduleText(change.entry.items, language),
        message: message || '',
        schedule_url: `${appUrl(app)}/live/${eventId}`,
      },
    })
    if (!record) return
    queued++
    const notice = change.notice || new Record(notices)
    notice.set('team', team.id)
    notice.set('fingerprint', change.entry.fingerprint)
    notice.set('notified_at', pbDate(Date.now()))
    app.save(notice)
  })
  return queued
}

/**
 * Account emails (verification, password reset) in the user's language: replaces the subject
 * and body PocketBase rendered with the auth_* template in users.language. `path` is the web
 * app's page for the link token. Without a template the PocketBase email is sent unchanged.
 */
function localizeAccountEmail(e, key, path) {
  const template = findTemplate(e.app, key, e.record.getString('language'))
  const token = e.meta && e.meta.token
  if (!template || !token) return
  const vars = {
    name: e.record.getString('name'),
    app_name: e.app.settings().meta.appName || 'Judge26',
    action_url: `${appUrl(e.app)}${path}?token=${encodeURIComponent(token)}`,
  }
  e.message.subject = render(template.getString('subject'), vars, false).replace(/\s+/g, ' ').trim()
  e.message.html = render(template.getString('body'), vars, true)
}

module.exports = {
  appUrl,
  localizeAccountEmail,
  BACKOFF_MINUTES,
  MAX_ATTEMPTS,
  TEMPLATE_VARIABLES,
  render,
  escapeHtml,
  unknownVariables,
  enqueue,
  deliver,
  processDue,
  retry,
  requireScheduleNotifier,
  scheduleChanges,
  serializeChange,
  notifySchedule,
}
