# M4 – Tables and scheduling

Refines roadmap milestone M4. The engine lives in `packages/scheduling-engine` (pure TypeScript,
independent of PocketBase and Vue, bundled into `apps/backend/hooks/lib/scheduling-engine.js`).
Times are absolute (epoch milliseconds in the engine, ISO strings in PocketBase), so schedules
span several days without special handling (M4-14).

## Data model

| Collection / field               | Purpose                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `tables`                         | Physical tables of an event (M4-01): `name` (unique per event), `active`, `categories` (empty = any, M4-02) |
| `time_slots`                     | Availability periods (`kind = play`) and unavailable periods (`kind = break`, M4-03, M4-04)                 |
| `games.table`, `games.starts_at` | Placement of a game (M4-05): table and absolute start time. The duration comes from its round               |
| `games.locked`                   | Locked games are never moved by generation (M4-12)                                                          |
| `games.judges`                   | Judges assigned to the game; each must hold a `judge` or `head_judge` role in the event (M4-09)             |
| `rounds.duration_minutes`        | Length of a game of the round (default 15 when empty)                                                       |
| `events.min_rest_minutes`        | Minimum gap between two games of one team (M4-10); 0 disables the rule                                      |

A game is **scheduled** when it has a table, a start time or judges. Only games with status
`scheduled` are placed by generation; completed, disqualified and absent games keep their times
and act as fixed obstacles.

## Conflict rules (M4-07 to M4-10)

Two games overlap when their intervals intersect (`start` to `start + duration`). For every pair
of scheduled games the engine reports:

| Code             | Field       | Rule                                                      |
| ---------------- | ----------- | --------------------------------------------------------- |
| `table_conflict` | `table`     | same table, overlapping (M4-T02); adjacent games are fine |
| `team_conflict`  | `starts_at` | same team, overlapping (M4-T03)                           |
| `rest_interval`  | `starts_at` | same team, gap smaller than `min_rest_minutes` (M4-T07)   |
| `judge_conflict` | `judges`    | same judge, overlapping (M4-T04)                          |

Single-game rules:

| Code                    | Field       | Rule                                                                         |
| ----------------------- | ----------- | ---------------------------------------------------------------------------- |
| `time_required`         | `starts_at` | a table is set without a start time                                          |
| `unknown_table`         | `table`     | the table is not part of the event                                           |
| `table_inactive`        | `table`     | the table has been deactivated                                               |
| `incompatible_category` | `table`     | the table is restricted to other categories (M4-T06)                         |
| `outside_availability`  | `starts_at` | the game does not fit completely into a play period                          |
| `unavailable`           | `starts_at` | the game overlaps a break, e.g. lunch (M4-T05)                               |
| `invalid_judge`         | `judges`    | a judge has no judge role in the event (checked on write, not by the engine) |

A game with a table but no start time is rejected (`time_required`). A game with a start time
but no table is allowed; it still conflicts with its team and judges.

Validation is applied on every write of a game (`prepareGame`) against the current state of the
event, so a move is always re-evaluated (M4-T11). A table that still hosts games cannot be
deactivated or deleted (`table_in_use`).

## Automatic generation (M4-06, M4-T08, M4-T09)

`POST /api/events/{id}/schedule/generate` (event managers; archived events are refused)

- Places every unlocked scheduled game on a table and start time. Candidate starts lie on a grid
  of the shortest game length, inside play periods, outside breaks, on compatible tables.
- Backtracking search that always continues with the game that has the fewest remaining options,
  so the result is deterministic. The search has a node budget; exhausting it reports
  `limit_reached` instead of running indefinitely.
- **Complete:** the placements are stored in one transaction. The unlocked games are cleared
  first, so no intermediate state conflicts.
- **Infeasible:** `409` with `status: "infeasible"`, the number of games that fit, and for each
  unplaced game the reasons (`no_compatible_table`, `no_availability_long_enough`,
  `blocked_by_locked_games_or_breaks`, `no_conflict_free_slot`). Nothing is stored.
- Body `{ "dry_run": true }` returns the placements without storing them.
- Locked games and games that already have a result keep their placement. Locked games that
  already conflict with each other are reported as `invalid` (409) and nothing changes.

The generator does not assign judges; judges are set manually and checked (M4-09).

## Concurrent edits (M4-11, M4-T12)

A schedule change through the API (`table`, `starts_at` or `judges` in the body) must include
`expected_updated`, the `updated` value the client based its change on. If the game changed
since, the request fails with `409` and the client must reload. Other fields (results, notes)
need no version. Server-side generation does not use this check.

## Validation (M4-13)

`GET /api/events/{id}/schedule/validation` returns every current issue of the event (for event
staff). Each issue names the game, the other game in a pairwise conflict, the field to fix and a
message.

## Access

| Collection   | Read                                                 | Write                  |
| ------------ | ---------------------------------------------------- | ---------------------- |
| `tables`     | Like the event (staff; coaches for published events) | Event managers, admins |
| `time_slots` | Like the event                                       | Event managers, admins |
| `games`      | Unchanged from M3 (staff and the team's coach)       | Event managers, admins |

Generation, validation and judge routes apply the same rules as the collections. Schedule data is
visible to coaches through the games collection; public schedule displays follow in M6.

`GET /api/events/{id}/judges` returns `{ id, name }` of the event's judges for event staff. Users
and role assignments are not listable by staff, so the schedule reads judge names from here.

## Staff interface

The event page has a **Schedule** tab for event staff. It shows the tables and time slots (event
managers edit them), the games with their table, start time and judges, and a check and generation
panel:

- **Preview** runs generation with `dry_run` and reports what would be placed, without saving.
- **Generate schedule** saves a complete schedule. If the games do not fit, nothing is saved and
  each unplaced game lists its reasons.
- The conflict list shows the current validation issues with the team concerned.
- Editing a placement sends the `updated` value that was loaded, so a concurrent edit is refused
  with a message to reload.

Coaches see the placed games of their teams (start, round, table) on **My teams**.

**Query note.** The games list is filtered through the team (`team.event`, `team.category`), not
through the round. Combined with the games access rule, a filter through `round` produced a SQL
query that took seconds on a handful of games and stalled the page under parallel load. Both paths
reach the same event, because a game's team must be in the round's category (M3-02).

## Out of scope for this release

- Table-specific availability periods (availability is event-wide).
- Automatic judge assignment and judge workload fairness.
- Travel or changeover time between tables.
- Drag-and-drop schedule editing and the public schedule display (M6).
- Retroactive re-validation when time slots change: validation runs on writes of games, and the
  validation endpoint reports anything left over.
