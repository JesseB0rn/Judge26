# M8-E – Assignment board

Refines roadmap requirements M8-25 – M8-33. The board is the top of the event's **Assignments** tab
(for event managers and admins; `/events/{id}/board` redirects there). It is where tables are
created and judges and teams are assigned. Below it, the generator fills gaps and the game list
shows every attempt with its table and sequence; the planner (M4-14) stays responsible for time.

## Layout (M8-25, M8-30)

- **Columns** are tables, grouped by category. Each group starts with a **category divider**;
  groups follow the category codes, and tables without exactly one category come last as
  **Unsorted**.
- Each table shows its **judge slots** first: as many as the category's `judges_per_table`
  (default 2, set from the divider's menu), filled ones with the judge, free ones dashed.
- Then its **teams in sequence order** (1, 2, …).
- Beside the board, **trays** list the teams without a table (filterable by category) and the
  judges without a table.
- A **+** at the end of each group, or the divider's menu, adds a table (M8-26); a table's menu
  renames, deactivates, deletes (only while no games are on it) or moves it to another category.

## Rounds (M8-31)

| Scope                    | Board shows                       | A team move writes                                                                          |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| **All rounds** (default) | each category's first round       | every round of the category: round _k_ puts the team of slot _s_ at slot _s + k_ (wrapping) |
| **Round _n_ only**       | the _n_-th round of each category | only that round                                                                             |

Example with teams 1, 2, 3 on a table: round 1 → 1 2 3, round 2 → 3 1 2, round 3 → 2 3 1.

Only the tables involved (where the team was and where it goes) are rewritten; in every round
written, their order follows the board. Games that already started (any status but `scheduled`)
are **locked**: they keep their table and sequence (shown with a lock), and the other teams take the
free sequence numbers around them. Missing games of a team are created when it is placed.

## Moves

| What                   | How                                             | Rule                                                                                                                             |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Team (M8-28)           | Drag between trays and tables, or reorder; menu | Only to active tables of the team's category (other drops are refused)                                                           |
| Judge (M8-29)          | Drag between the tray and judge slots; menu     | Judges and head judges of the event; within the free slots. A judge on two active tables is highlighted as a conflict (M4-09)    |
| Table category (M8-27) | Drag a divider over tables; table menu          | Teams of the old category are taken off the table after a confirmation; tables where another category already played cannot move |

Every drag can also be done from the item's menu (keyboard accessible), and drags use pointer
events, so they work with touch on tablets (M8-33).

## Several judges per table

`tables.judge` became `tables.judges`. **Every judge of a table scores its games** (M5); the
judge dashboard lists the games of every table the user judges. A table without judges no longer
blocks placing teams; the schedule validation still reports it (`missing_table_judge`), and
automatic generation still only uses tables with judges.

## Concurrent edits (M8-32)

- A team move states the `updated` version of every game it is based on (the team's games and
  those of the tables involved, in the rounds it writes); judge moves state the tables' versions;
  category moves, renames and (de)activations state the table's version.
- If anything changed meanwhile, the API returns **409**; the board shows a notice and reloads.
- Other open boards of the event update live (realtime subscriptions on games and tables).

## Data

| Change                        | Notes                                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| `tables.judges`               | Replaces `tables.judge`; access rules test `game.table.judges.id`        |
| `categories.judges_per_table` | 1–10, empty = 2; copied with the category                                |
| Table positions               | Renumbered in board order after board changes, so groups stay contiguous |

Migration `1764700000_m8_board.js` (copies each table's judge into `judges`).

## API

| Method | Path                                             | Body                                               |
| ------ | ------------------------------------------------ | -------------------------------------------------- |
| GET    | `/api/events/{id}/board`                         | → categories, rounds, tables, teams, games, judges |
| POST   | `/api/events/{id}/board/teams`                   | `{ team, table, index, round?, expected }`         |
| POST   | `/api/events/{id}/board/judges`                  | `{ judge, from, to, expected }`                    |
| POST   | `/api/events/{id}/board/tables`                  | `{ category, name? }`                              |
| POST   | `/api/events/{id}/board/tables/{table}/category` | `{ category, confirm?, expected_updated }`         |

Event managers and admins; writes refuse archived events. Every write returns the whole board and
is recorded in the audit log (`board.move_team`, `board.move_judge`, `board.table_category`, table
creation).
