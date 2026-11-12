# API

The backend is PocketBase. Collection CRUD endpoints follow the
[PocketBase Web API](https://pocketbase.io/docs/api-records/); access is controlled by each
collection's API rules (defined in migrations).

## Caching

API responses must never be cached; see [M3 spec](../specifications/M3-rounds-and-ranking.md#caching).

## Concurrent edits

Updates that send `expected_updated` (the record's `updated` value they were based on) are refused
with `409` if the record changed since; score corrections send `expected_corrections`. See
[M7 security](../specifications/M7-audit-backup-security.md#concurrent-updates-m7-t10).

## Error format

All errors use PocketBase's format:

```json
{
  "status": 400,
  "message": "Failed to create record.",
  "data": {
    "key": { "code": "validation_required", "message": "Cannot be blank." }
  }
}
```

## Custom endpoints

| Method   | Path                                      | Auth                   | Description                                                                                         |
| -------- | ----------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| GET      | `/api/health`                             | public                 | PocketBase health check (built-in)                                                                  |
| GET      | `/api/app/info`                           | public                 | `{ name, environment }`; verifies that hooks are loaded                                             |
| POST     | `/api/events/{id}/schedule/generate`      | event managers         | Creates missing games and assigns tables/sequences; `{ dry_run }`; `409` report if infeasible (M4)  |
| GET      | `/api/events/{id}/schedule/validation`    | event staff            | All current table/sequence assignment issues and planner warnings (`planner_issues`, M4)            |
| GET      | `/api/events/{id}/planner`                | verified users         | Schedule planner data; internal blocks and warnings for staff only (M4-14)                          |
| GET      | `/api/judging/assignments`                | verified users         | Games on the tables the user judges (M5)                                                            |
| GET      | `/api/events/{id}/judging`                | reviewers              | All games of the event with their score status (M5)                                                 |
| GET/PUT  | `/api/games/{id}/sheet`                   | table judge, reviewers | Score sheet page data / autosave a draft (M5)                                                       |
| POST     | `/api/games/{id}/sheet/{action}`          | see spec               | `submit`, `approve`, `reject`, `correct` ([M5 spec](../specifications/M5-judging.md#api))           |
| GET      | `/api/public/events`                      | public                 | Published and archived events with their days (M6)                                                  |
| GET      | `/api/public/events/{id}`                 | public                 | Schedule, game states, categories and publication state ([M6 spec](../specifications/M6-live.md))   |
| GET      | `/api/public/categories/{id}/ranking`     | public                 | Published official and live ranking, progress (M6)                                                  |
| GET      | `/api/mail/templates/variables`           | admins                 | Variables of each email template (M7-02)                                                            |
| POST     | `/api/mail/outbox/{id}/retry`             | admins, event managers | Queue a failed email again ([M7 spec](../specifications/M7-communication.md#api))                   |
| GET/POST | `/api/events/{id}/notifications/schedule` | event managers         | Affected teams / email their schedule (M7-04)                                                       |
| GET      | `/api/events/{id}/staff`                  | event managers         | Staff with invitation status; `DELETE …/staff/{assignment}` removes a role (M8-09)                  |
| POST     | `/api/events/{id}/invitations[/preview]`  | event managers         | Invite people by name and email, or preview it ([M8 spec](../specifications/M8-invitations.md#api)) |
| POST     | `/api/invitations/{id}/resend\|revoke`    | event managers         | Send an invitation again / revoke it (M8-09)                                                        |
| GET/POST | `/api/invitations/lookup`, `…/accept`     | public                 | Inspect / accept an invitation link (M8-10)                                                         |

## Collections

| Collection         | Purpose                           | Access             | Migration                                                              |
| ------------------ | --------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `users`            | Built-in auth collection          | PocketBase default | –                                                                      |
| `app_settings`     | Platform-wide key/value settings  | superusers only    | `1762700000_create_app_settings.js`                                    |
| `tables`           | Event tables with a fixed judge   | event managers     | `1763100000_m4_scheduling.js`, `1763200000_m5_round_table_sequence.js` |
| `round_phases`     | Placed phases of rounds (M4-14)   | event managers     | `1763800000_m4_planner.js`                                             |
| `schedule_blocks`  | Custom planner blocks (M4-14)     | event managers     | `1763800000_m4_planner.js`, `1763900000_m4_planner_columns.js`         |
| `schedule_columns` | Custom planner columns (M4-14-33) | event managers     | `1763900000_m4_planner_columns.js`                                     |
| `team_documents`   | Files attached to teams (M1-13)   | event managers     | `1764000000_team_documents.js`                                         |
| `score_sheets`     | Judge score sheets (M5)           | read-only via API  | `1763300000_m5_judging.js`                                             |
| `score_audit`      | Append-only score audit (M5)      | read-only via API  | `1763300000_m5_judging.js`                                             |
| `live_revisions`   | Change counter per event (M6)     | read-only via API  | `1763400000_m6_live.js`                                                |
| `mail_templates`   | Email templates (M7-02)           | admins (edit only) | `1764100000_m7_communication.js`                                       |
| `mail_outbox`      | Queued and sent emails (M7-01)    | read-only via API  | `1764100000_m7_communication.js`                                       |
| `schedule_notices` | Last notified schedule per team   | internal           | `1764100000_m7_communication.js`                                       |
| `audit_log`        | Administrative actions (M7-08)    | read-only via API  | `1764200000_m7_audit_log.js`                                           |
