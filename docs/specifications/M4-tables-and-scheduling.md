# M4 – Tables and scheduling

Defines event tables, shared round phases, and game ordering during the scoring phase. Scheduling
does not assign clock times: every table has fixed event judges (several since M8-E), and each game
is assigned to a table with a positive sequence number within its round. Tables, judges and teams
are usually assigned on the board ([M8-board.md](M8-board.md)).

## Data model

| Collection / field       | Purpose                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tables`                 | Physical tables of an event. `name` is unique per event; `active` controls availability; an empty `categories` list accepts every category; `judges` are the table's event judges (M8-E). |
| `rounds.testing_minutes` | Shared maintenance/testing phase duration in minutes (0 or more).                                                                                                                         |
| `rounds.scoring_minutes` | Shared scoring phase duration in minutes (at least 1).                                                                                                                                    |
| `games.table`            | Assigned table, or empty while unassigned.                                                                                                                                                |
| `games.sequence`         | Positive order on the assigned table for that round; 0 means unassigned.                                                                                                                  |

The round's total duration is `testing_minutes + scoring_minutes`. Maintenance/testing and scoring
are shared phases, not per-game time slots. Games run at their assigned tables during the scoring
phase. Judges are not assigned to individual games.

## Assignment validation

Each game assignment must reference an active table in the same event and a table that accepts the
round's category. A table without judges is reported by the validation but no longer blocks a
placement (M8-E). Sequence numbers must be positive and unique
for each round/table pair. Unassigned games use an empty `table` and sequence `0`.

| Code                    | Field      | Rule                                                           |
| ----------------------- | ---------- | -------------------------------------------------------------- |
| `missing_table`         | `table`    | The game has not been assigned to a table.                     |
| `invalid_table`         | `table`    | The table belongs to another event.                            |
| `table_inactive`        | `table`    | The assigned table is deactivated.                             |
| `incompatible_category` | `table`    | The table only accepts other categories.                       |
| `missing_table_judge`   | `table`    | The table has no assigned judge (validation only).             |
| `required`              | `sequence` | An assigned game must have a positive sequence.                |
| `sequence_in_use`       | `sequence` | The round/table already has this sequence number.              |
| `invalid_judge`         | `judges`   | An assigned judge is not a judge or head judge for this event. |

Validation runs on game writes. A table with assigned games cannot be deactivated or deleted until
those games are moved or unassigned.

## Automatic generation

`POST /api/events/{id}/schedule/generate` is available to event managers and admins. Archived events
cannot be scheduled.

- For every approved team and round in the same category, generation creates a scheduled first
  attempt when that team/round has no game yet. Existing game attempts satisfy this requirement.
- Existing valid assignments are kept. Unassigned games are distributed deterministically across
  active, category-compatible tables that have judges, balancing each round by game count. Team
  names provide a stable order.
- A complete result stores new games and assignments atomically. If any game cannot be assigned,
  the endpoint returns `409` and writes nothing.
- `{ "dry_run": true }` previews the assignments and missing-game count without writing.
- An infeasible response includes each unassigned game's reason, such as `no_active_table`,
  `no_compatible_table`, or `missing_table_judge`.

The sequence is local to a table and round; no start-time or game-duration placement is produced.

## Concurrent edits

A client update that changes a game's `table` or `sequence` must include `expected_updated`, the
version it loaded. If the game changed since, the API returns `409` and the client should reload.
Server-side generation uses a transaction and does not use this client version check.

## Validation and access

`GET /api/events/{id}/schedule/validation` returns assignment issues for event staff.

| Collection | Read                                                   | Write                  |
| ---------- | ------------------------------------------------------ | ---------------------- |
| `tables`   | Like the event (staff; any verified user if published) | Event managers, admins |
| `games`    | Staff of the event, admins                             | Event managers, admins |

Generation requires event-manager or admin access. Validation and the event-judge list are
available to event staff. (The coaches' `GET /api/users/{id}/schedule` endpoint was removed with
the coach role, M8-A.)

## Staff interface

The event **Assignments** tab (formerly Schedule) starts with the assignment board ([M8-board.md](M8-board.md)), where
managers create, rename, deactivate and delete tables and assign their judges, category and teams.
Below it they preview or generate a schedule, review validation issues, and edit any game's
table/sequence (including extra attempts) in the game list. Other staff see the game list.
Preview does not create games. Generation creates missing games only when all assignments can be
made.

## Schedule planner (M4-14)

The planner (`/events/{id}/planner`) shows **all competition days next to one another**. Each day
is a group of columns, one per category (by name) followed by the event's **custom columns**
(e.g. visitors, judges; M4-14-33) in their own order; rows are time of day on an axis shared by all
days, from the earliest day start to the latest day end in whole hours (widened to any block outside
those hours). Hours outside a day's own window are shaded. Times are local times of day (`HH:MM`)
on a competition day, like `competition_days.date`: no time zone conversion, nothing crosses
midnight. The planner does not assign times to individual games; game order stays table + sequence.

### Data model

| Collection / field                          | Purpose                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `competition_days.starts_at`, `ends_at`     | Hours of the day (`HH:MM`). Empty means 08:00 / 18:00. `ends_at` must be after `starts_at` (`invalid_range`).                                                                                                            |
| `round_phases`                              | One phase of a round: `round`, `phase` (`maintenance`, `check`, `scoring`), `day`, `starts_at`, `duration_minutes` (1–1440). Unique per round and phase. Placed = day **and** start set; otherwise it waits in the tray. |
| `schedule_blocks`                           | Custom blocks: `event`, `day`, `starts_at`, `duration_minutes` (5–1440), `title`, `place`, `color` (palette), `responsibility`, `categories` (empty = all columns), `public`.                                            |
| `schedule_columns`                          | Custom columns of an event: `event`, `name` (unique per event, ≤ 60), `position`, `public`. Only custom blocks are placed in them.                                                                                       |
| `schedule_blocks.columns`                   | Custom columns a block covers, next to its `categories`. Both empty = all columns, custom ones included.                                                                                                                 |
| `rounds.testing_minutes`, `scoring_minutes` | Mirrored from the maintenance and scoring phases (and the other way round).                                                                                                                                              |
| `rounds.day`                                | Mirrors the scoring phase's day (M5 judge filter and M6 current day keep working).                                                                                                                                       |

Each phase of a round is its own block with its own day, start and duration, so other blocks (a
lunch) can sit between them and phases may be on different days. Hooks keep rounds and phases in
sync inside the saving transaction, saving only what differs:

- Every round has a scoring phase; it has a maintenance phase while `testing_minutes > 0` (setting
  it to 0 removes the phase). Changing a round's durations or day updates its phases.
- Changing a maintenance or scoring phase's duration, or the scoring phase's day, updates the round.
- A robot check is created (unplaced, 10 minutes by default in the UI) and deleted over the API.
  Maintenance and scoring phases cannot be created, deleted or changed to another kind.

Validation: a start needs a day (`required`), the day must belong to the round's / block's event
(`invalid_day`), block categories must belong to the event (`invalid_category`), and a block must
end by midnight (`crosses_midnight`), and block columns must belong to the event
(`invalid_column`). A custom column with blocks cannot be deleted over the API (move or delete its
blocks first); deleting the event removes its columns. Updates that change placement fields must send
`expected_updated`; a stale write returns `409` (M4-14-19).

### Warnings (M4-14-20 – M4-14-24)

Warnings never block saving. They are shown on the blocks, listed above the grid and returned by
`GET /api/events/{id}/schedule/validation` as `planner_issues` (`{ code, message, items: [{ kind,
id }] }`).

| Code            | Rule                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `phase_order`   | A round's placed phases are not in the order maintenance, robot check, scoring, or overlap. Gaps are fine. |
| `round_overlap` | Phases of different rounds of the same category overlap.                                                   |
| `table_overlap` | Scoring runs or robot checks of rounds whose games use the same table overlap.                             |
| `judge_overlap` | Scoring runs need the same fixed judge on two different tables at the same time.                           |
| `outside_day`   | A phase or block extends beyond its day's hours (also after shrinking the hours).                          |

Custom blocks never cause warnings.

### Interface

- **Editing** (managers on tablets and larger screens): drag a block to move it (5-minute snap);
  phases stay in their category column, a custom block in one column can change column, and any
  block can be dropped on another day. Holding Shift while dropping (or _Move later phases too_)
  also moves the round's later phases, keeping their gaps. Drag the lower edge to resize; drag or
  click on empty space to create a custom block there. Unplaced phases wait in the tray and are
  dragged into their column. Keyboard: arrows move (Shift: 15 minutes, left/right: day),
  Alt+arrows resize, Enter opens. _Undo_ (Ctrl/⌘+Z) reverts recent moves and resizes.
- **Custom columns** (managers): add, rename, reorder, make public or internal, and delete in the
  _Custom columns_ dialog. Their headers are italic and their columns tinted. A single-column
  custom block can be dragged between category and custom columns.
- **Forms**: custom blocks (title, day, start, duration, place, responsibility, columns, color,
  public; delete, duplicate); phases (day, start, duration, unplace, add/remove robot check, link
  to the round's settings and back).
- **Deep links**: `?item=phase:<id>` or `?item=block:<id>` opens the block's form (read-only details
  for viewers) and scrolls to it. `cols` and `days` keep the shown columns and days.
- **Read-only**: event staff see internal blocks and warnings; other users of a published event
  see public blocks and public custom columns only. Archived events are staff only. Public pages and TV mode always show the public custom
  columns. Phones are always read-only.
- Today's column has a line at the current time; printing gives one A4 landscape page per day,
  titled with the event name and venue.
- The judge dashboard and _My teams_ show the round's scoring start where set.

### API and access

`GET /api/events/{id}/planner` returns `days` (with hours), `categories`, `columns`, `rounds`, `phases`,
`blocks`, `issues`, `internal`, `can_edit` and `my_categories`. Staff (admins, managers, judges,
head judges) get internal blocks and issues; other verified users get public blocks of published
events (and archived events they have teams in).

| Collection         | Read                                                | Write                                                             |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| `round_phases`     | Like the event                                      | Event managers, admins (not archived); create/delete only `check` |
| `schedule_blocks`  | Staff; public blocks for everyone seeing the event  | Event managers, admins (not archived)                             |
| `schedule_columns` | Staff; public columns for everyone seeing the event | Event managers, admins (not archived)                             |
