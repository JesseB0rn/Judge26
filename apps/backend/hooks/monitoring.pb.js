/// <reference path="../pb_data/types.d.ts" />

// M7-13: monitoring. Health checks, browser error reports and alerts (hooks/lib/monitoring.js).
// See docs/specifications/M7-monitoring.md and docs/operations/monitoring.md.

onBootstrap((e) => {
  e.next()
  require(`${__hooks}/lib/monitoring.js`).markStarted(e.app)
})

// GET /api/app/health -> { status: "ok" | "degraded" | "down", checked_at }
// Public, for uptime monitors and the container health check: 503 only when the server cannot
// serve (database down); "degraded" (e.g. failed emails, stale backup) answers 200.
routerAdd('GET', '/api/app/health', (e) => {
  const result = require(`${__hooks}/lib/monitoring.js`).cachedEvaluate(e.app)
  return e.json(result.status === 'down' ? 503 : 200, {
    status: result.status,
    checked_at: result.checked_at,
  })
})

// GET /api/app/monitoring -> every check with details and the recent errors (admins)
routerAdd(
  'GET',
  '/api/app/monitoring',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    if (!access.isVerifiedUser(e.auth) || !access.isAdmin(e.app, e.auth)) {
      throw new ForbiddenError('Only admins can view the system health.')
    }
    const monitoring = require(`${__hooks}/lib/monitoring.js`)
    const result = monitoring.evaluate(e.app)
    result.recent_errors = monitoring.recentErrors(e.app, 20)
    result.alerts = !!$os.getenv('MONITORING_ALERT_EMAIL')
    return e.json(200, result)
  },
  $apis.requireAuth('users', '_superusers'),
)

// POST /api/app/client-errors { message, stack?, url? } -> 204
// Uncaught errors in the SPA, written to the server log (public: errors happen signed out too;
// rate-limited per client and in total).
routerAdd('POST', '/api/app/client-errors', (e) => {
  const monitoring = require(`${__hooks}/lib/monitoring.js`)
  const accepted = monitoring.recordClientError(
    e.app,
    e.requestInfo().body || {},
    e.realIP(),
    e.auth,
    e.request.header.get('User-Agent'),
  )
  if (!accepted) throw new TooManyRequestsError('Too many error reports, try again later.')
  return e.noContent(204)
})

// Alerts when a check starts failing or everything recovered (MONITORING_ALERT_EMAIL).
cronAdd('monitoring', '*/5 * * * *', () => {
  require(`${__hooks}/lib/monitoring.js`).runAlerts($app)
})

const monitoringEnv = $os.getenv('PB_ENV')
if (monitoringEnv === 'development' || monitoringEnv === 'test') {
  // POST /api/dev/monitoring/run -> runs the alert job immediately
  routerAdd('POST', '/api/dev/monitoring/run', (e) => {
    return e.json(200, require(`${__hooks}/lib/monitoring.js`).runAlerts(e.app))
  })

  // POST /api/dev/monitoring/error { message } -> logs a server error (tests of the error check)
  routerAdd('POST', '/api/dev/monitoring/error', (e) => {
    e.app.logger().error(String(e.requestInfo().body.message || 'Simulated server error'))
    return e.noContent(204)
  })

  // GET /api/dev/monitoring/crash -> a hook that throws, logged as a request with status 0
  routerAdd('GET', '/api/dev/monitoring/crash', () => {
    throw new Error('Simulated crash')
  })
}
