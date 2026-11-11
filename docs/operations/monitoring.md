# Runbook: monitoring

What to watch before and during an event, and what to do when something is wrong. See
[M7 monitoring](../specifications/M7-monitoring.md) for what the checks do.

## Set up (once per deployment)

1. **Alert emails:** set `MONITORING_ALERT_EMAIL` in `.env` (comma-separated, e.g. the organizers'
   technical contact) and restart (`docker compose up -d`). Alerts need working SMTP.
2. **Uptime monitor:** point any external HTTP monitor (Uptime Kuma, UptimeRobot, Healthchecks,
   a status page service) at `https://<domain>/api/app/health`, every 1–5 minutes:
   - alert on a status other than 200 (503 = database down) or no answer (server down),
   - optionally also on the keyword `"degraded"` in the response.

   The server cannot email you when it is down; this is what the monitor is for. Run it outside
   the server's network.

3. Check _Admin → System health_ shows **All systems normal** (a fresh deployment says "No backup
   yet" until the first automatic backup).

| Variable                          | Default | Meaning                                         |
| --------------------------------- | ------- | ----------------------------------------------- |
| `MONITORING_ALERT_EMAIL`          | empty   | Addresses alerted when a check fails / recovers |
| `MONITORING_ERROR_WINDOW_MINUTES` | `60`    | Errors in this window make the error check warn |
| `MONITORING_BACKUP_MAX_AGE_HOURS` | `26`    | Age of the latest backup that counts as stale   |

With a backup schedule less frequent than daily, raise `MONITORING_BACKUP_MAX_AGE_HOURS`.

## During an event

Keep _System health_ open on the organizers' laptop (it refreshes every 30 seconds), or rely on
the alert emails. Also useful: `docker compose ps` (container health), `docker compose logs -f app`.

## When a check fails

| Check          | What to do                                                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database down  | `docker compose logs app`. Disk full (`df -h`) or permissions on the volume are the usual causes. Restart (`docker compose restart app`); if the database is damaged, restore the latest backup ([backup runbook](backup-and-restore.md)).                                              |
| Errors         | Open the error in _Recent errors_ (click for the stack). One-off browser errors from old tabs are harmless; repeated server errors on one URL are a bug: note the URL, version and time, check `docker compose logs app`, report it. Superusers see all logs in the dashboard (_Logs_). |
| Email delivery | "SMTP is not configured": set `SMTP_*` and restart. Failed emails: check the error under _Emails_, fix the SMTP settings, then retry the messages there. Overdue emails: the server's jobs are not running; restart.                                                                    |
| Backups        | Check `docker compose logs app` for backup errors and free disk space; create a backup manually (_dashboard → Settings → Backups_). "Disabled": set `BACKUP_CRON`.                                                                                                                      |

The error check clears by itself once no new errors occurred for the window (60 minutes); the
others as soon as the cause is fixed. You get an "all checks are OK again" email when everything
is fine.
