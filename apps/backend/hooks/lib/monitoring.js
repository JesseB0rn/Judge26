/// <reference path="../../pb_data/types.d.ts" />

// M7-13: monitoring. Health checks of the things that break during an event (database, errors,
// email delivery, backups), browser error reports and email alerts to the operators.
// See docs/specifications/M7-monitoring.md and docs/operations/monitoring.md.
//
//   MONITORING_ALERT_EMAIL            comma-separated addresses alerted when a check starts or
//                                     stops failing (empty: no alerts)
//   MONITORING_ERROR_WINDOW_MINUTES   window of the error check (default 60)
//   MONITORING_BACKUP_MAX_AGE_HOURS   age after which the latest backup is stale (default 26)

const CHECK_LABELS = {
  database: 'Database',
  errors: 'Errors',
  mail: 'Email delivery',
  backups: 'Backups',
}
/** Pending messages this much past due mean the delivery job is not running. */
const MAIL_STUCK_MS = 10 * 60 * 1000
/** Failed messages count against the mail check for this long. */
const MAIL_FAILED_WINDOW_MS = 24 * 60 * 60 * 1000
/** The public health endpoint reuses an evaluation for this long. */
const CACHE_MS = 15 * 1000
/** Browser error reports accepted per minute, per client and in total. */
const CLIENT_LIMIT_PER_IP = 10
const CLIENT_LIMIT_TOTAL = 100
const CLIENT_ERROR_MESSAGE = 'Client error'
const ALERT_STATE_KEY = 'monitoring.alert_state'

function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ')
}

function envInt(name, fallback) {
  const value = parseInt($os.getenv(name) || '', 10)
  return value > 0 ? value : fallback
}

function production() {
  return ($os.getenv('PB_ENV') || 'production') === 'production'
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function hoursAgo(ms) {
  const hours = Math.round(ms / 3600000)
  return hours < 1 ? 'less than an hour ago' : `${plural(hours, 'hour')} ago`
}

/** When this server process started (set in onBootstrap). */
function startedAt(app) {
  const value = parseInt(app.store().get('monitoring_started_at') || '0', 10)
  return value || Date.now()
}

function markStarted(app) {
  app.store().set('monitoring_started_at', String(Date.now()))
}

function scalar(db, sql, params) {
  const row = new DynamicModel({ n: 0 })
  db.newQuery(sql)
    .bind(params || {})
    .one(row)
  return row.n
}

// ---------------------------------------------------------------------------
// Checks. Each returns { status: 'ok' | 'warn' | 'down', detail }.
// ---------------------------------------------------------------------------

function checkDatabase(app) {
  try {
    scalar(app.db(), 'SELECT COUNT(*) AS n FROM _collections')
    scalar(app.auxDB(), 'SELECT 1 AS n')
    return { status: 'ok', detail: 'Reachable' }
  } catch (err) {
    return { status: 'down', detail: `Not reachable: ${String(err).slice(0, 300)}` }
  }
}

// PocketBase logs every failed request at ERROR level, including 403 and 404. Only server
// errors (5xx, or a hook that threw a plain Error, logged with status 0) and errors logged by
// the application itself count.
const SERVER_ERROR = `(level >= 8 AND (
    (json_extract(data, '$.type') = 'request'
      AND (json_extract(data, '$.status') >= 500 OR json_extract(data, '$.status') = 0))
    OR (json_extract(data, '$.type') IS NOT 'request' AND message != {:client})))`
const CLIENT_ERROR = '(level >= 8 AND message = {:client})'

function checkErrors(app, now) {
  if (app.settings().logs.maxDays <= 0) {
    return { status: 'warn', detail: 'Logs are disabled (Settings → Logs), errors are not kept.' }
  }
  const minutes = envInt('MONITORING_ERROR_WINDOW_MINUTES', 60)
  const params = { since: pbDate(now - minutes * 60000), client: CLIENT_ERROR_MESSAGE }
  const count = (where) =>
    scalar(
      app.auxDB(),
      `SELECT COUNT(*) AS n FROM _logs WHERE created >= {:since} AND ${where}`,
      params,
    )
  const server = count(SERVER_ERROR)
  const browser = count(CLIENT_ERROR)
  if (!server && !browser) return { status: 'ok', detail: `None in the last ${minutes} minutes` }
  const parts = []
  if (server) parts.push(plural(server, 'server error'))
  if (browser) parts.push(plural(browser, 'browser error'))
  return { status: 'warn', detail: `${parts.join(' and ')} in the last ${minutes} minutes` }
}

function checkMail(app, now) {
  const settings = app.settings()
  const capture = !production() && !settings.smtp.enabled
  const problems = []
  if (!settings.smtp.enabled && !capture) {
    problems.push('SMTP is not configured, emails cannot be delivered')
  }
  const failed = scalar(
    app.db(),
    "SELECT COUNT(*) AS n FROM mail_outbox WHERE status = 'failed' AND updated >= {:since}",
    { since: pbDate(now - MAIL_FAILED_WINDOW_MS) },
  )
  if (failed) problems.push(`${plural(failed, 'email')} failed in the last 24 hours`)
  const stuck = scalar(
    app.db(),
    "SELECT COUNT(*) AS n FROM mail_outbox WHERE status = 'pending' AND next_attempt_at < {:before}",
    { before: pbDate(now - MAIL_STUCK_MS) },
  )
  if (stuck) problems.push(`${plural(stuck, 'email')} overdue, the delivery job may not be running`)
  if (problems.length) return { status: 'warn', detail: problems.join('; ') }
  const pending = scalar(app.db(), "SELECT COUNT(*) AS n FROM mail_outbox WHERE status = 'pending'")
  const queued = pending ? `, ${plural(pending, 'email')} queued` : ''
  return { status: 'ok', detail: (capture ? 'Captured (no SMTP)' : 'Delivering') + queued }
}

/** Newest backup's modification time (ms), or 0 if there is none. */
function latestBackup(app) {
  const fsys = app.newBackupsFilesystem()
  try {
    let latest = 0
    fsys.list('').forEach((file) => {
      const ms = file.modTime.unixMilli()
      if (ms > latest) latest = ms
    })
    return latest
  } finally {
    fsys.close()
  }
}

function checkBackups(app, now) {
  const cron = app.settings().backups.cron
  if (!cron) {
    return production()
      ? { status: 'warn', detail: 'Automatic backups are disabled (BACKUP_CRON)' }
      : { status: 'ok', detail: 'Automatic backups are disabled (not production)' }
  }
  const maxAge = envInt('MONITORING_BACKUP_MAX_AGE_HOURS', 26) * 3600000
  let latest
  try {
    latest = latestBackup(app)
  } catch (err) {
    return { status: 'warn', detail: `Backups cannot be listed: ${String(err).slice(0, 300)}` }
  }
  if (!latest) {
    return now - startedAt(app) > maxAge
      ? { status: 'warn', detail: `No backup exists (schedule “${cron}”)` }
      : { status: 'ok', detail: `No backup yet (schedule “${cron}”)` }
  }
  return now - latest > maxAge
    ? { status: 'warn', detail: `Latest backup is stale: ${hoursAgo(now - latest)}` }
    : { status: 'ok', detail: `Latest backup ${hoursAgo(now - latest)} (schedule “${cron}”)` }
}

const CHECKS = {
  database: checkDatabase,
  errors: checkErrors,
  mail: checkMail,
  backups: checkBackups,
}

/** Runs every check. Overall status: down if any check is down, degraded if any warns. */
function evaluate(app) {
  const now = Date.now()
  const checks = Object.keys(CHECKS).map((id) => {
    let result
    try {
      result = CHECKS[id](app, now)
    } catch (err) {
      // A check that cannot run is itself a problem (e.g. a broken table).
      result = { status: 'warn', detail: `Check failed: ${String(err).slice(0, 300)}` }
    }
    return { id, label: CHECK_LABELS[id], status: result.status, detail: result.detail }
  })
  let status = 'ok'
  if (checks.some((c) => c.status === 'down')) status = 'down'
  else if (checks.some((c) => c.status !== 'ok')) status = 'degraded'
  return {
    status,
    checked_at: new Date(now).toISOString(),
    started_at: new Date(startedAt(app)).toISOString(),
    version: $os.getenv('APP_VERSION') || 'dev',
    commit: $os.getenv('GIT_COMMIT') || 'unknown',
    checks,
  }
}

/** evaluate(), reused for a few seconds so a busy uptime monitor does not cost queries. */
function cachedEvaluate(app) {
  const store = app.store()
  const cached = store.get('monitoring_cache')
  if (cached) {
    const value = JSON.parse(cached)
    if (Date.now() - value.at < CACHE_MS) return value.result
  }
  const result = evaluate(app)
  store.set('monitoring_cache', JSON.stringify({ at: Date.now(), result }))
  return result
}

// ---------------------------------------------------------------------------
// Recent errors (admins)
// ---------------------------------------------------------------------------

function parseJson(text) {
  try {
    return JSON.parse(text || '{}') || {}
  } catch (_) {
    return {}
  }
}

/** Newest server and browser errors of the last 24 hours. */
function recentErrors(app, limit) {
  const rows = arrayOf(new DynamicModel({ id: '', level: 0, message: '', data: '', created: '' }))
  app
    .auxDB()
    .newQuery(
      `SELECT id, level, message, data, created FROM _logs
       WHERE created >= {:since} AND (${SERVER_ERROR} OR ${CLIENT_ERROR})
       ORDER BY created DESC LIMIT {:limit}`,
    )
    .bind({
      since: pbDate(Date.now() - 24 * 3600000),
      client: CLIENT_ERROR_MESSAGE,
      limit: limit || 20,
    })
    .all(rows)
  return rows.map((row) => {
    const data = parseJson(row.data)
    const browser = row.message === CLIENT_ERROR_MESSAGE
    const request = data.type === 'request'
    return {
      id: row.id,
      created: row.created,
      source: browser ? 'browser' : 'server',
      message: browser ? String(data.message || '') : row.message,
      detail: String((browser ? data.stack : data.error) || '').slice(0, 2000),
      url: String(browser ? data.url || '' : request ? data.url || '' : ''),
      status: request ? data.status : null,
    }
  })
}

// ---------------------------------------------------------------------------
// Browser error reports
// ---------------------------------------------------------------------------

/** Per-minute counters; false if the report exceeds the per-client or total limit. */
function allowClientReport(app, ip) {
  const store = app.store()
  const minute = Math.floor(Date.now() / 60000)
  let window = parseJson(store.get('monitoring_client_window'))
  if (window.minute !== minute) window = { minute, total: 0, ips: {} }
  const fromIp = window.ips[ip] || 0
  if (window.total >= CLIENT_LIMIT_TOTAL || fromIp >= CLIENT_LIMIT_PER_IP) return false
  window.total++
  window.ips[ip] = fromIp + 1
  store.set('monitoring_client_window', JSON.stringify(window))
  return true
}

function text(value, max) {
  return String(value === undefined || value === null ? '' : value).slice(0, max)
}

/** Logs an error reported by the SPA. Returns false if it was rate-limited. */
function recordClientError(app, body, ip, auth, userAgent) {
  if (!allowClientReport(app, ip)) return false
  const message = text(body.message, 500).trim()
  if (!message) {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    fieldError('message', 'required', 'A message is required.')
  }
  app
    .logger()
    .error(
      CLIENT_ERROR_MESSAGE,
      'message',
      message,
      'stack',
      text(body.stack, 4000),
      'url',
      text(body.url, 500),
      'userAgent',
      text(userAgent, 300),
      'auth',
      auth ? auth.id : '',
    )
  return true
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function alertRecipients() {
  return String($os.getenv('MONITORING_ALERT_EMAIL') || '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
}

function loadState(app) {
  try {
    const record = app.findFirstRecordByFilter('app_settings', 'key = {:key}', {
      key: ALERT_STATE_KEY,
    })
    return { record, value: parseJson(record.getString('value')) }
  } catch (_) {
    return { record: null, value: {} }
  }
}

function saveState(app, record, value) {
  const target = record || new Record(app.findCollectionByNameOrId('app_settings'))
  target.set('key', ALERT_STATE_KEY)
  target.set('value', value)
  target.set('description', 'Last monitoring state (M7-13), to alert only on changes.')
  app.save(target)
}

function alertHtml(result, appUrl) {
  const mail = require(`${__hooks}/lib/mail.js`)
  const rows = result.checks
    .map(
      (c) =>
        `<li><strong>${mail.escapeHtml(c.label)}: ${c.status}</strong> – ${mail.escapeHtml(c.detail)}</li>`,
    )
    .join('\n')
  const link = appUrl ? `<p><a href="${appUrl}/admin/monitoring">Open system health</a></p>` : ''
  return `<p>Status: <strong>${result.status}</strong> (version ${mail.escapeHtml(result.version)}, ${result.checked_at})</p>\n<ul>\n${rows}\n</ul>\n${link}`
}

/**
 * Compares the checks with the last saved state and emails the operators when a check starts
 * failing or everything has recovered. Returns { status, alerted: [addresses], failing }.
 */
function runAlerts(app) {
  const result = evaluate(app)
  const failing = result.checks.filter((c) => c.status !== 'ok').map((c) => c.id)
  const state = loadState(app)
  const before = state.value.failing || []
  const added = failing.filter((id) => before.indexOf(id) === -1)
  const recovered = before.length > 0 && failing.length === 0
  const changed = added.length > 0 || recovered || failing.length !== before.length
  let alerted = []
  if (added.length || recovered) {
    const labels = added.map((id) => CHECK_LABELS[id]).join(', ')
    app
      .logger()
      .warn('Monitoring status changed', 'status', result.status, 'failing', failing.join(','))
    const subject = recovered
      ? 'Judge26: all checks are OK again'
      : `Judge26 ${result.status}: ${labels} need${added.length === 1 ? 's' : ''} attention`
    const appUrl = String(app.settings().meta.appURL || '').replace(/\/+$/, '')
    const html = alertHtml(result, appUrl)
    alerted = alertRecipients()
    alerted.forEach((to) => {
      const record = new Record(app.findCollectionByNameOrId('mail_outbox'))
      record.set('template', 'monitoring_alert')
      record.set('to', to)
      record.set('subject', subject)
      record.set('html', html)
      record.set('status', 'pending')
      record.set('attempts', 0)
      record.set('next_attempt_at', pbDate(Date.now()))
      record.set('immediate', true)
      app.save(record)
    })
  }
  if (changed || !state.record) {
    saveState(app, state.record, { status: result.status, failing, at: result.checked_at })
  }
  return { status: result.status, failing, alerted }
}

module.exports = {
  CHECK_LABELS,
  markStarted,
  evaluate,
  cachedEvaluate,
  recentErrors,
  recordClientError,
  runAlerts,
}
