# Test plan: M7 – Monitoring (M7-13)

- **Integration** = `apps/backend/tests/m7-monitoring.test.ts`; route permissions in
  `m7-security.test.ts` (route inventory, guests and unverified users, dev routes absent in production)
- **Unit** = `apps/web/src/modules/administration/__tests__/monitoring.spec.ts` (System health page),
  `apps/web/src/shared/__tests__/clientErrors.spec.ts`, `errorHandling.spec.ts`,
  `apps/web/src/modules/system/__tests__/BackendStatus.spec.ts` (Status page)
- **Container** = `docker/smoke-test.sh` / `scripts/smoke-test.mjs` (health endpoint, checks run)

| Scenario                                        | Expected result                                       | Covered by         |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------ |
| Fresh server                                    | All checks ok; public status has no details           | Integration        |
| Guest, user, event manager request the details  | 401 / 403 / 403; admins and superusers get them       | Integration        |
| Backup created                                  | Backup check reports the latest backup                | Integration        |
| Email failed after all retries                  | Mail check warns, status degraded                     | Integration        |
| Check starts failing, keeps failing, recovers   | One alert email, none while failing, one "OK again"   | Integration        |
| Pending email overdue                           | Mail check warns (delivery job not running)           | Integration        |
| 401, 403, 404, failed sign-in                   | Not counted as errors                                 | Integration        |
| Hook crash, application error log               | Counted and listed with URL and error                 | Integration        |
| Browser error reported                          | Logged, listed as browser error; empty message is 400 | Integration        |
| Long browser error fields                       | Truncated                                             | Integration        |
| More than 10 reports per minute from one client | 429                                                   | Integration        |
| Production without SMTP, backups off            | Degraded, both reported; health stays 200             | Integration        |
| Uncaught frontend error / API error             | Reported / not reported                               | Unit               |
| Same error repeated, error storm                | Sent once, at most 10 per page load; never throws     | Unit               |
| System health page                              | Status, checks, errors (expandable), refresh failure  | Unit               |
| Status page                                     | Shows health; still online if health unavailable      | Unit               |
| Deployed container                              | Health 200 (ok/degraded), monitoring checks run       | Container          |
| Database unavailable                            | Health 503, container unhealthy                       | Not tested (below) |
| Stale backup (older than the max age)           | Backup check warns                                    | Manual (see below) |

## Manual verification

- **Database unavailable** cannot be simulated reliably: PocketBase keeps the SQLite files open,
  so changing permissions or removing files does not make queries fail. The check runs a query on
  both databases and reports `down` (503) when one throws; reviewed in code.
- **Stale backup:** set `MONITORING_BACKUP_MAX_AGE_HOURS=1` and wait an hour after the last backup;
  the System health page shows the backup check as a warning and an alert email is sent.
- **Uptime monitor:** point the monitor at `/api/app/health`, stop the container, check that the
  monitor alerts.
