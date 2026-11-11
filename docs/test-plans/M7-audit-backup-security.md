# Test plan: M7 – Audit log, backups and security (M7-08 – M7-11)

- **Integration** = `apps/backend/tests/m7-audit-backup.test.ts` (audit log, backup, restore,
  restart) and `apps/backend/tests/m7-security.test.ts` (rule lint, outsiders, endpoints,
  escalation, concurrency, production configuration)
- **Unit** = `apps/web/src/modules/administration/__tests__/audit.spec.ts` (audit log page, event
  Activity tab), the rankings and judging view specs (versions sent with edits and corrections)

## Features

| ID    | Feature          | Covered by                                                                                      |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------- |
| M7-08 | Audit log        | Integration (actor, changes, redaction, deletes, superusers, server actions, read access), Unit |
| M7-09 | Backup           | Integration (valid archive, superusers only, audit, automatic backups in production)            |
| M7-10 | Recovery         | Integration (restore with restart; records, relations, accounts, roles; audit after restart)    |
| M7-11 | Security testing | Integration (rule lint, outsider matrix, endpoint matrix, escalation, dev routes in production) |

## Tests

| Test ID | Scenario                     | Expected                                | Covered by                                                       |
| ------- | ---------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| M7-T07  | Create backup                | Backup file is valid                    | Integration (ZIP with CRC check, `data.db` is SQLite)            |
| M7-T08  | Restore backup               | Records and relationships preserved     | Integration (game with round, team, table; later changes undone) |
| M7-T09  | Unauthorized API request     | Access denied                           | Integration (every collection and custom endpoint, 7 outsiders)  |
| M7-T10  | Concurrent score submissions | No lost or silently overwritten updates | Integration (submits, approvals, corrections, result edits)      |
| M7-T11  | Simulate server restart      | Application recovers                    | Integration (data kept, queued email delivered); M6-T08          |
