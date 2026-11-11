# M5 – Judge interface and scoring workflow

Refines roadmap milestone M5. Judges score the games on their table on a tablet at the table;
head judges approve or return submitted scores; approved scores become the game result that feeds
the ranking (M3). Design goal: the screen must be readable at a glance in the middle of a run.

## Roles

| Who                                             | Can                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| **Table judge** (`tables.judge`)                | Open, score and submit the games on their table (M5-01 – M5-10)         |
| Judge of another table                          | Nothing: the score sheet returns `403` (M5-T03)                         |
| **Reviewer** (head judge, event manager, admin) | Score any game of the event, approve, return and correct (M5-11, M5-12) |

A game is _assigned_ when it is placed on a table (M4) whose judge is the user. Archived events
are read-only.

## Data model

| Collection / field | Purpose                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `rounds.day`       | Competition day the round is played on (optional; must belong to the round's event) (M5-02)    |
| `score_sheets`     | At most one per game: `status`, `outcome`, `ruleset`, `values`, `time_ms`, `points`, reviewers |
| `score_audit`      | Append-only trail: `action`, `actor`, `reason`, `before`, `after` (M5-13)                      |

Both collections are **read-only through the API** (no create/update/delete rule). Reads: admins,
head judges and event managers of the game's event, and the game's table judge. All writes go
through the judging routes. Audit entries cannot be changed, not even by superusers.

## Workflow

```text
 (no sheet) ──save──▶ draft ──submit──▶ submitted ──approve──▶ finalized ──correct (reason)──▶ finalized
                        ▲                   │
                        └──── rejected ◀────┘ return (reason)
```

| Step       | Who      | Rules                                                                                                 |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------- |
| Save draft | scorer   | Autosave. Allowed while `draft` or `rejected`; values are stored as entered (no validation)           |
| Submit     | scorer   | Sheet must be complete: scoring engine in `final` mode (M5-T09). Status `submitted`                   |
| Approve    | reviewer | Only `submitted`. Copies outcome, values, time into the **game**; status `finalized` (M5-T10)         |
| Return     | reviewer | Only `submitted`; a reason is required; the judge sees it and can resubmit                            |
| Correct    | reviewer | Only `finalized`; a reason is required; must be a complete sheet; old and new values audited (M5-T12) |

- **Outcome** is `completed` (scored), `disqualified` or `absent`. Only completed games have values
  and time; the others need no sheet values.
- **Ruleset version.** The first save pins the active published ruleset of the round's
  [game rule](M2-scoring-rulesets.md#game-rules) to the sheet; the game references that version,
  so recalculation uses it (M2-T11). Without a published ruleset, points are entered directly.
  With several games in the category, the sheet payload names the game (`ruleset.game_rule`).
- **Points** are always computed by the server from the values (the same engine runs live in the
  browser for M5-06).
- **Approval is always required** (answers roadmap question 15.4 for now). A reviewer who scores a
  game still approves it as a separate step.
- **Ranking.** Until approval the game stays `scheduled`, so only finalized scores count.

### Protecting results (invariant 1)

- A submitted or finalized score cannot be overwritten by a draft or a resubmission (`409`,
  `data.status.code` = current status). Judges cannot correct (`403`, M5-T11).
- Direct edits of `status`, `points`, `time_ms`, `values` or `ruleset` through the games API (the M3
  result form) are refused with `409` while a sheet is submitted or finalized, and such games
  cannot be deleted. Other direct result edits are allowed for managers and audited as
  `manual_edit`.

## Offline and autosave (M5-09, M5-14)

- Every change is written to the device (`localStorage`) **immediately** and sent to the server
  ~0.7 s later. The header shows _Saving… / Saved / Offline · saved on this device / Not saved to
  server · retrying_.
- Each draft carries `client_saved_at` (the device time of the change). The server ignores a draft
  older than the stored one and returns the newer version (`stale: true`), so a late offline sync
  from a second device does not overwrite newer work.
- While offline, the last loaded game page and game list are shown from the device cache; pending
  drafts are retried on the browser `online` event, every 10 s, and when the dashboard opens.
- If the sheet was submitted or finalized meanwhile, the server answers `409`: the device draft is
  discarded, the server score is shown, and the judge is told (M5-T15).
- The stopwatch state is stored on the device only.

## Stopwatch and time (M5-07, M5-08)

The stopwatch runs on wall-clock timestamps (start time + accumulated time), so it keeps running
across reloads. **Start**, **Pause/Resume**, **Stop** (records the time) and **Reset**. The time can
be entered or corrected manually as `m:ss.cc` or seconds (`95.37`, comma accepted). Times are stored
in milliseconds.

## Interface

- **Dashboard** (`/judging`, linked from the home page and the main navigation): an _Up next_ card
  with the first game still to score, then all assigned games in playing order (day, round,
  sequence) grouped by round, each with its status and result. Filters: day, table, _to do_ (kept in
  the URL). From sign-in to the score sheet is two taps.
- **Robot checks** (M5-15): if a round on the judge's table has a robot check in the schedule
  planner (M4-14-13), the dashboard shows a _Robot check_ block per round and table with its day,
  time (or "not scheduled yet") and team count. The dashboard is **one timeline**: game groups in
  playing order (day, round, table, sequence), each round's checks directly before that round's
  games, even if the check is on an earlier day. The day filter uses the check's own day.
  - **Up next** is the first open item of the timeline: an open robot check comes before the
    first game of its round. A check is done once the judge finished it on this device
    (_Finish robot check_ on the last team; can be reopened) or as soon as any game of that round
    at that table is no longer _Not scored_. Done checks show a check mark and are hidden by the
    _to do_ filter.
  - The block opens the **guided check** (`/judging/rounds/{round}/check?table=…&team=…`): the
    table's teams in playing order (each once), one at a time, with the team's documents (M1-13)
    shown inline (images, PDFs) or as open/download links, _Previous_ / _Next team_ buttons (and
    arrow keys), a jump list and a link to the team's score sheet. The current team is kept in
    the URL. Offline, the teams come from the list saved on the device; documents need a
    connection. Per-team check results are not recorded, and finishing a check is stored on the
    device only.
- **Score sheet** (`/judging/games/{id}`): a sticky header with team, category, round, table,
  sequence and day, the status, the save state and a large live **total**; result choice
  (Scored / Disqualified / Absent); stopwatch; the sheet generated from the ruleset with large touch
  targets (≥ 48 px); history. A fixed action bar holds the single next action: _Submit score_ (with
  the missing criteria listed, tap to jump; missing criteria are highlighted), _Approve / Return_,
  _Correct score_ or _Back to my games_. Submission asks for confirmation with a read-back summary.
- **Status** is shown with colour, icon and text: Not scored, Draft, Returned, Submitted, Final,
  Recorded (entered directly by a manager).
- **Review**: head judges and managers get a _Review_ tab on the dashboard and a _Scores_ tab on the
  event page, listing sheets waiting for review first, filterable by status and table.
- Nothing depends on hover; the layout is designed for 768 × 1024.

## API

| Method | Path                            | Who                    | Body / result                                                         |
| ------ | ------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| GET    | `/api/judging/assignments`      | any verified user      | Games on the user's tables (non-archived events), with `round.check`¹ |
| GET    | `/api/events/{id}/judging`      | reviewers              | All games of the event with their score status                        |
| GET    | `/api/games/{id}/sheet`         | table judge, reviewers | Context, ruleset, sheet, history, permissions                         |
| PUT    | `/api/games/{id}/sheet`         | table judge, reviewers | `{ outcome, values, time_ms, points?, client_saved_at }` → draft      |
| POST   | `/api/games/{id}/sheet/submit`  | table judge, reviewers | Same body → `submitted`                                               |
| POST   | `/api/games/{id}/sheet/approve` | reviewers              | → `finalized`, game updated                                           |
| POST   | `/api/games/{id}/sheet/reject`  | reviewers              | `{ reason }` → `rejected`                                             |
| POST   | `/api/games/{id}/sheet/correct` | reviewers              | `{ reason, outcome, values, time_ms, points? }` on a finalized score  |

¹ Each row has `check`: `null` if the round has no robot check, otherwise
`{ day: { id, date, label } | null, starts_at, duration_minutes }` (`day` null and `starts_at`
empty while unplaced).

Errors: `403` not assigned / not a reviewer; `400` field errors (`values: invalid_score_sheet`,
`reason: required`, `points: required`); `409` wrong status (`data.status.code`).
