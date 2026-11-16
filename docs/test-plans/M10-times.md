# Test plan: M10-C – Run times (M10-18 – M10-20)

- **Engines** = `packages/scoring-engine/tests/time.test.ts` (counted time, validation),
  `packages/ranking-engine/tests/time.test.ts` (formatting, resolutions, ranking with precision)
- **Integration** = `apps/backend/tests/m10-times.test.ts` (sheet flow, versions, live ranking,
  snapshots, payloads, templates)
- **Unit** = `apps/web/src/modules/judging/__tests__/ScoreGameView.spec.ts` (decimals, zero-point
  note and submit summary), `rankings/__tests__/{lib,export,views,report}.spec.ts`,
  `events/__tests__/views.spec.ts` (setting), `scoring/__tests__/{components,views}.spec.ts`
  (inspector toggle, default of a first ruleset)
- **E2E** = `e2e/live/times-m10.spec.ts` (public live ranking and TV in tenths, zero points as
  2:00.0, the judge's note)

## Features

| ID     | Feature              | Covered by                                                                               |
| ------ | -------------------- | ---------------------------------------------------------------------------------------- |
| M10-18 | Time for zero points | Engines, Integration (game counted, sheet and history measured, versions), Unit, E2E     |
| M10-19 | Time precision       | Engines (format), Integration (payloads, 0–3, templates), Unit (all views, exports), E2E |
| M10-20 | Precision in ranking | Engines (ties), Integration (live recalculated, snapshot unchanged), Unit (preview)      |

## Tests

| Test ID | Scenario                                              | Expected                                | Covered by                      |
| ------- | ----------------------------------------------------- | --------------------------------------- | ------------------------------- |
| M10-T27 | Run with 0 points and 43 s measured, option on        | Counts with 120 s; 43 s kept in history | Engines, Integration, Unit, E2E |
| M10-T28 | Option off; a run with points                         | Measured time counts                    | Engines, Integration, Unit      |
| M10-T29 | Finalized result under an earlier ruleset version     | Unchanged                               | Integration                     |
| M10-T30 | 95 379 ms at each precision on all views and exports  | 1:35 … 1:35.379; exports 95 … 95.379 s  | Engines, Unit, E2E              |
| M10-T31 | Equal points, 95.1 s and 95.9 s; whole s, then tenths | Tied on time; then ranked apart         | Engines, Integration            |
| M10-T32 | Change the precision after results exist              | Live recalculated; snapshot unchanged   | Integration                     |
