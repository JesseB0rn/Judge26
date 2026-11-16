# M10-B – Robot check, parts check and round file

Implements M10-08 – M10-17 of the roadmap. Before M10-B a finished robot check was only remembered
on the judge's device (M5-15); now every check is stored on the server and can gate scoring.

Code: `apps/backend/hooks/lib/checks.js` (rules), `apps/backend/hooks/checks.pb.js` (routes and
record guards), migration `1765400000_m10_checks.js`; web `modules/judging` (robot check view,
dashboard, score sheet, `ChecksView.vue`), round settings (`RoundsPanel.vue`) and the planner's
block dialog. Tests: see `docs/test-plans/M10-checks.md`.

## Check mode per round (M10-08, M10-09)

`rounds.check_mode` is `off`, `synchronous` or `asynchronous`.

- **New rounds** get `synchronous` unless the request says otherwise. The robot check phase of the
  planner (M4-14-13) follows the mode: a mode other than `off` creates an unplaced 10-minute check
  phase, `off` removes it. Adding the check in the planner turns the mode on (synchronous),
  removing it there turns it off.
- **Existing rounds** keep what they had: the migration sets `synchronous` where a check phase
  exists, `off` otherwise.
- **Who changes it**: event managers in the round settings (record API) and through
  `PUT /api/rounds/{id}/check-mode`; head judges through that route on the _Checks_ page, but only
  between synchronous and asynchronous. Once a check of the round is recorded, switching between
  synchronous and asynchronous is refused (`check_mode: checks_recorded`); turning the check off
  stays possible for managers.
- **Event templates** (M8-21) carry `check_mode` per round and `kind` / `blocks_first_round` per
  block. Older templates without `check_mode` get `synchronous` when the round has a check phase,
  `off` otherwise.

## Checks stored (M10-10)

- `robot_checks`: one row per round and team, with the table, `checked`, `checked_by`,
  `checked_at` and the device time of the last change (`client_saved_at`).
- `robot_check_tables`: a table confirmed its check as complete (ready for the run), with
  `ready_by` and `ready_at`.
- The collections have no API rules; only the routes below read and write them. Allowed are the
  judges of the team's table and head judges, managers and admins of the event (stepping in,
  M10-07). Archived events are read-only.
- **Reopening** a team (`checked: false`) is refused once scoring of that team started (a score
  sheet exists or a result was entered): `check: scoring_started`. Reopening a team makes its
  table not ready again.
- **Offline**: the robot check view queues a change on the device
  (`judge26:judging:checkq:<round>:<team>`) and sends it when the connection is back, on the next
  dashboard load or with the next check. A change older than the stored one (by
  `client_saved_at`) does not overwrite it; the server returns the stored state with `stale`.
  A change the server refuses is dropped. Marking a table ready needs a connection.

## Synchronous and asynchronous mode (M10-11, M10-12)

Scoring is gated in `saveDraft` (only when the sheet does not exist yet: "cannot be started") and
in `submit` (always):

| Gate             | When                                                     | Error (409)            |
| ---------------- | -------------------------------------------------------- | ---------------------- |
| Parts check open | See M10-16 below                                         | `parts_check: open`    |
| Not released     | Synchronous round without `released_at`                  | `round: not_released`  |
| Not confirmed    | Asynchronous round and the team's check is not confirmed | `check: not_confirmed` |

- An absent team never comes to the check, so in asynchronous mode its absence can be recorded
  without a check (the sheet offers _Team did not come: record as absent_).
- **Release**: `POST /api/rounds/{id}/release` by head judges, managers and admins (table judges
  get 403). With a table of the round not ready, a reason is required (`reason: required`, the
  message names the tables). Every release is written to the audit log (`round.release`), with the
  tables that were not ready and the reason. `DELETE` withdraws a release while no score sheet of
  the round exists (`round.withdraw_release`). After a release, a table cannot be set not ready.
- `released_at`, `released_by`, `release_reason` and the parts check's `completed_*` fields
  cannot be set through the record API (`read_only`, superusers excepted).
- Judge list rows and the sheet payload carry `robot_check` (mode, release, the team's check, the
  table's completion, the gating parts check), `gate` (`""`, `parts_check`, `not_released`,
  `not_confirmed`) and `round_file`.

## Head judge progress (M10-13)

`GET /api/events/{id}/checks` (head judges, managers, admins): every round with placed games, with
mode, release and per table the teams checked of total and the ready state; and every parts check
with its tables' confirmations. The _Checks_ page (`/judging/checks?event=`, linked from the judge
dashboard for reviewers) shows it, with the mode select, the release (asking for a reason when
tables are not ready), parts check completion and the round file.

**Live updates**: the new collections increase the event's live revision (M6-01), so the _Checks_
page, the judge dashboard, the robot check view and a locked score sheet reload when anything
changes. A locked sheet reloads only while locked, so nothing being entered is replaced.

## Round without check (M10-14)

With `check_mode = off` the judge timeline has no check (no check phase), scoring is not gated and
`PUT /api/rounds/{id}/checks` is refused (`check: off`).

## Parts check (M10-15, M10-16)

- A **parts check block** is a planner block (`schedule_blocks`) with `kind = parts_check`; it is
  placed on a day for categories like any block and belongs to no round. The block dialog has
  _Parts check_ and _Blocks the first round_ (on by default, also for API creations without the
  field).
- **Planner warning** `parts_check_late`: the block ends after the start of the day's first scoring
  phase of a covered category.
- **Tables** of a parts check: the active tables of the event that serve a covered category
  (tables without categories serve all). A block without categories and columns covers all
  categories.
- Each table's judge (or a head judge at the table) confirms it on the dashboard
  (`POST /api/parts-checks/{id}/tables/{table}`); it is _up next_ while unconfirmed.
- The head judge marks it **completed** on the _Checks_ page
  (`POST /api/parts-checks/{id}/complete`). With tables still open the API answers 409
  `tables: open` naming them, unless `force: true`; the app asks first, naming the open tables.
  Completion is audited (`parts_check.complete`, with the open tables). `DELETE` reopens it.
- **Gate**: with _blocks the first round_ on and the block not completed, the robot check and
  scoring of the day's **first round** (lowest position among the category's rounds on the block's
  day) of each covered category are refused (`parts_check: open`). Other categories, later rounds
  and days without the block are not gated.

## Randomization file (M10-17)

- `round_files`: one protected file per round (PNG, JPEG, WebP, GIF or PDF, up to 10 MB), with the
  uploaded name. Upload or replace with `POST /api/rounds/{id}/file` (multipart `file`), remove with
  `DELETE`, by head judges, managers and admins. Other types and larger files are refused by the
  file field's validation (400 with `file`); table judges get 403.
- `GET /api/rounds/{id}/file` serves the file (`Cache-Control: private, no-store`) to head judges,
  managers and admins, and to judges of the round's tables once it is shown: after the release in
  synchronous mode, after their table's check is complete in asynchronous mode, at once without a
  check. Before that judges get 409 `file: not_released`; anyone else (also guests) 404. It is
  never public.
- The robot check view and the score sheet show it inline (image or PDF) once shown; the web app
  loads it with the sign-in into a local object URL.
