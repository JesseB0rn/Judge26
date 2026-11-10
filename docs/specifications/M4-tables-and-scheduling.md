# M4 – Tables and scheduling

Defines event tables, shared round phases, and game ordering during the scoring phase. Scheduling
does not assign clock times: every table has one fixed event judge, and each game is assigned to a
table with a positive sequence number within its round.

## Data model

| Collection / field       | Purpose                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tables`                 | Physical tables of an event. `name` is unique per event; `active` controls availability; an empty `categories` list accepts every category; `judge` is the table's fixed event judge. |
| `rounds.testing_minutes` | Shared maintenance/testing phase duration in minutes (0 or more).                                                                                                                     |
| `rounds.scoring_minutes` | Shared scoring phase duration in minutes (at least 1).                                                                                                                                |
| `games.table`            | Assigned table, or empty while unassigned.                                                                                                                                            |
| `games.sequence`         | Positive order on the assigned table for that round; 0 means unassigned.                                                                                                              |

The round's total duration is `testing_minutes + scoring_minutes`. Maintenance/testing and scoring
are shared phases, not per-game time slots. Games run at their assigned tables during the scoring
phase. Judges are not assigned to individual games.

## Assignment validation

Each game assignment must reference an active table in the same event, a table that accepts the
round's category, and a table with an assigned judge. Sequence numbers must be positive and unique
for each round/table pair. Unassigned games use an empty `table` and sequence `0`.

| Code                    | Field      | Rule                                                            |
| ----------------------- | ---------- | --------------------------------------------------------------- |
| `missing_table`         | `table`    | The game has not been assigned to a table.                      |
| `invalid_table`         | `table`    | The table belongs to another event.                             |
| `table_inactive`        | `table`    | The assigned table is deactivated.                              |
| `incompatible_category` | `table`    | The table only accepts other categories.                        |
| `missing_table_judge`   | `table`    | The table has no assigned judge.                                |
| `required`              | `sequence` | An assigned game must have a positive sequence.                 |
| `sequence_in_use`       | `sequence` | The round/table already has this sequence number.               |
| `invalid_judge`         | `judge`    | The assigned judge is not a judge or head judge for this event. |

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

| Collection | Read                                                 | Write                  |
| ---------- | ---------------------------------------------------- | ---------------------- |
| `tables`   | Like the event (staff; coaches for published events) | Event managers, admins |
| `games`    | Unchanged from M3 (staff and the team's coach)       | Event managers, admins |

Generation requires event-manager or admin access. Validation and the event-judge list are
available to event staff. Coaches read their own scheduled games from `GET /api/users/{id}/schedule`;
the endpoint verifies ownership and returns only their assigned games.

## Staff interface

The event **Schedule** tab lets managers configure tables, their fixed judges and category limits;
preview or generate a schedule; review validation issues; and edit a game's table/sequence.
Preview does not create games. Generation creates missing games only when all assignments can be
made. Coaches see each scheduled team's round, table and sequence on **My teams**.
