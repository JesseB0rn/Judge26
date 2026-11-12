# M7 – Audit log, backups and security

Refines roadmap tasks M7-08 – M7-11. Operations are described in the
[backup and restore runbook](../operations/backup-and-restore.md).

## Audit log (M7-08)

Every administrative change is recorded in `audit_log`: who (account, or `superuser <email>`, or
`system`), when, from which IP, what (collection, record, event) and which fields changed.
Changes an admin makes while viewing the app as a role are recorded under the admin, with the
role in `view_as` ([M8-view-as.md](M8-view-as.md#audit-m8-17)).

- **Record API changes** of these collections are logged by request hooks (`hooks/audit.pb.js`):
  events, competition days, categories, teams, team documents, role assignments, games (game
  rules), rulesets, rounds, round phases, schedule blocks and columns, tables, games (results and
  schedule), ranking snapshots and email templates. Creates and deletes store the record's
  non-empty fields; updates store `{ field: [before, after] }`. Saves without a change are not
  logged.
- **Server actions** log themselves: publishing a ranking snapshot, correcting a finalized score
  (`score.correct`), generating the schedule (`schedule.generate`), sending schedule emails
  (`notifications.schedule`), retrying an email (`mail.retry`), backups (`backup.create`,
  `backup.create_requested`, `backup.restore_requested`, `backup.restore`).
- **Privacy:** passwords and tokens are never stored. Team members, score values, ruleset and
  ranking definitions, snapshot data and template bodies are logged as `[set]` / `[changed]` only.
  Long texts are cut at 300 characters.
- **Access:** the log is written only by the server (no create, update or delete through the API).
  Admins read all entries on **Audit log** (`/admin/audit`); event managers read their event's
  entries on the event's **Activity** tab. Nobody else reads any.
- A failure to log never fails the action. Score sheets additionally keep their own detailed
  history (`score_audit`, M5).

## Backups (M7-09) and recovery (M7-10)

PocketBase backups are ZIP archives of `pb_data`: the SQLite databases (`data.db`, `auxiliary.db`)
and uploaded files (team documents). They are stored in `pb_data/backups` (or S3, configurable in
the dashboard).

- **Automatic backups:** daily at 03:30 in production, keeping the latest 14, unless configured
  otherwise. `BACKUP_CRON` (a cron expression, or `off`) and `BACKUP_MAX_KEEP` override this on
  start; without them, a schedule set in the dashboard is kept.
- **Manual backups, download, upload, restore:** superusers only, in the PocketBase dashboard
  (_Settings → Backups_), through `/api/backups`, or with
  `pnpm --filter @judge26/backend backup create|list|download|upload|restore`.
- **Restore** replaces all data with the backup and restarts the server. Records, relations,
  accounts, roles and files are exactly as when the backup was taken (M7-T08). The restore is
  recorded in the restored audit log after the restart.

## Security testing (M7-11)

`apps/backend/tests/m7-security.test.ts` verifies the permission boundaries against a running
server:

- **Rule lint:** every API rule of every collection is `null` (server only) or starts with
  "verified user" (`@request.auth.id != "" && @request.auth.verified = true && …`) without a
  top-level `||`. The few deliberate exceptions (registration, own account, the public change
  counter) are listed in the test; any new public rule fails it. `app_settings` and
  `schedule_notices` are closed completely.
- **Outsiders** (guest, unverified account, verified account without roles, former coach / judge / head
  judge / manager of another event) can neither read, list, update nor delete any record of an
  event, for every event-scoped collection; in a published event they see the event but no
  teams, games, scores, documents, emails, audit entries or roles (M7-T09).
- **Custom endpoints:** a list of every `routerAdd` route (checked against the hook sources) with
  its access level; every route that needs an account denies guests and unverified users, and the
  event routes deny staff of other events. Development routes do not exist in production.
- **Privilege escalation:** users cannot assign themselves roles or verify their own account.
- **Production configuration:** automatic backups enabled, API responses not cacheable.

## Concurrent updates (M7-T10)

No update is lost or silently overwritten:

- **Score sheets:** submit, approve and reject run in a transaction that checks the sheet's status;
  of simultaneous requests one succeeds and the others get `409`.
- **Corrections** state the correction count they are based on (`expected_corrections`, sent by
  the score sheet page); a correction based on an outdated score gets `409` ("corrected by someone
  else in the meantime").
- **Record edits** that state `expected_updated` (schedule placements, planner phases and blocks,
  and results entered in the result form) are refused with `409` if the record changed since. The
  check and the save run in one transaction (`hooks/lib/concurrency.js`), so two requests based on
  the same version cannot both pass.

## Restart (M7-T11)

All state is in the database: after a restart, data is unchanged and queued emails are delivered
(the outbox, M7-01). Multi-day continuation is covered by M6-T08.
