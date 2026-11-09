# ADR 0005: Scheduling engine and placement model

- **Status:** accepted
- **Date:** 2026-11-09

## Context

M4 places games on physical tables and time slots, enforces conflict rules (teams, tables, judges,
rest, breaks, categories) and generates schedules automatically with locked games kept fixed. The
same rules must apply to manual edits, generation, and validation reports.

## Decisions

1. **Separate `packages/scheduling-engine`**, like the scoring and ranking engines: pure, bundled
   for the PocketBase hooks, and tested without a server. Conflict rules are defined once and
   used for single checks, full validation and generation.
2. **Placements live on the game.** A game has at most one table, start time and set of judges,
   so there is no separate assignment collection to keep in sync. The duration comes from the
   round, not from the placement.
3. **Absolute times.** Start times are timestamps, so multi-day events need no day model in the
   engine. Availability and breaks are periods of the event (`time_slots`).
4. **Generation is a deterministic backtracking search** with most-constrained-first ordering and
   a node budget. It returns either a complete placement or an explanation, and it stores nothing
   unless the result is complete. A single greedy pass cannot guarantee a complete placement when
   a team's later games must avoid its earlier ones, so the search backtracks.
5. **Every game write is validated** against the current event state, so a conflicting placement
   cannot be stored through the API. Changes to tables and time slots are not re-validated against
   existing games; the validation endpoint reports those. Generation clears the unlocked games in one
   transaction before writing, so the per-write checks never see a half-moved schedule.
6. **Optimistic concurrency for schedule edits** uses the record's `updated` value
   (`expected_updated`). Only direct API requests are checked, so the server's own writes are not
   blocked. Results and notes are not versioned.

## Consequences

- Generation loads the event for every saved game, which is quadratic in the number of games.
  Acceptable for competition sizes (hundreds of games); revisit if a single event grows larger.
- Judges are not assigned automatically. Judge workload fairness is a later extension -> assign a fixed number of judges to a table, and a single to judge to exactly one table.
- Tables have event-wide availability only. Per-table periods would extend `time_slots` with a
  table relation.
