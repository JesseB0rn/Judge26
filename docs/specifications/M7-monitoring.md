# M7 – Monitoring

Refines roadmap task M7-13 ("Errors and backend availability are observable"). Operations are in
the [monitoring runbook](../operations/monitoring.md). Implementation: `apps/backend/hooks/monitoring.pb.js`,
`apps/backend/hooks/lib/monitoring.js`, `apps/web/src/modules/administration/views/MonitoringView.vue`,
`apps/web/src/shared/clientErrors.ts`.

M7-12 (load testing with k6) is deferred; see the roadmap.

## Health checks

Each check reports `ok`, `warn` or `down` with a one-line detail. The overall status is **down**
if any check is down, **degraded** if any check warns, otherwise **ok**.

| Check      | Down / warn when                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database` | **Down** when the main or the logs database does not answer a query.                                                                                           |
| `errors`   | Server or browser errors in the last `MONITORING_ERROR_WINDOW_MINUTES` (60). Also warns when logs are disabled (_Settings → Logs_, max days 0).                |
| `mail`     | Production without SMTP; a message `failed` (all retries used) in the last 24 h; a pending message more than 10 min overdue (the delivery job is not running). |
| `backups`  | Automatic backups disabled in production; latest backup older than `MONITORING_BACKUP_MAX_AGE_HOURS` (26); no backup at all once the server has run that long. |

A check that throws is reported as `warn` with the error, so a broken check never hides the others.

### What counts as an error

PocketBase logs every failed request at ERROR level, including expected ones (401, 403, 404, 400
validation). Those are not counted. Counted are:

- requests that ended with status ≥ 500, or status 0 (a hook threw a plain `Error`; PocketBase
  answers 400 "Something went wrong" but logs status 0),
- errors logged by the application (`$app.logger().error(...)`, e.g. a crashed mail delivery),
- browser errors (below), counted separately.

PocketBase writes logs in batches, 3 s after the last log entry; on a busy server, when the batch
is full. An error therefore shows up in the check after a short delay.

## Endpoints

| Endpoint                      | Access | Response                                                                                                      |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/app/health`         | Public | `{ status, checked_at }`; **503** when down, 200 otherwise. No details. Evaluated at most every 15 s (cache). |
| `GET /api/app/monitoring`     | Admins | Status, version, commit, `started_at`, every check, `recent_errors` (latest 20 of 24 h), `alerts` (on/off).   |
| `POST /api/app/client-errors` | Public | `{ message, stack?, url? }` → 204. Rate-limited: 10 per client and 100 in total per minute (429).             |

- `/api/app/health` is meant for uptime monitors and is the container health check (`Dockerfile`).
  "Degraded" stays 200: the server can serve the event, someone should look at the details.
- Admins are users with the global `admin` role, or superusers. Event managers are not: the errors
  are not limited to their event.
- PocketBase's own `GET /api/health` is unchanged (liveness only, never checks the database).

## Browser errors

The SPA reports unexpected errors, i.e. everything that is not an API response (those are already
in the server log): uncaught component errors and unhandled promise rejections (both also shown to
the user as before) and uncaught script errors (`window` `error` event). Each distinct message is
sent once per page load, at most 10 per page load. Fields are truncated on the server (message
500, stack 4000, URL 500 characters); the user agent and the signed-in user's ID are added. A
report is a log entry with the message `Client error`; reporting never throws.

## Alerts

Every 5 minutes (cron `monitoring`) the checks are evaluated and compared with the last state,
stored in `app_settings` (`monitoring.alert_state`, survives restarts). When a check **starts**
failing, or when all checks are **OK again**, each address in `MONITORING_ALERT_EMAIL` gets an
email through the mail outbox (with its retries; template `monitoring_alert`, visible under
_Emails_). A check that keeps failing does not alert again. Without `MONITORING_ALERT_EMAIL` the
change is only logged (`Monitoring status changed`, WARN).

Alerts cannot report what stops the server or the mail itself: an external uptime monitor on
`/api/app/health` covers "the server is down" (runbook).

## System health page

_Admin → System health_ (`/admin/monitoring`): overall status, version and uptime, each check,
whether alerts are configured, recent errors (expand for the stack / error). Refreshes every 30 s.
The public _Status_ page shows the overall health next to the version.
