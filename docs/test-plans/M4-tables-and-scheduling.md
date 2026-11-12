# Test plan: M4 – Tables and scheduling

- **Integration** = `apps/backend/tests/m4-scheduling.test.ts` (real PocketBase, migrations, hooks, routes)
- **Unit** = `apps/web/src/modules/scheduling/__tests__/*` (helpers, API mapping, schedule tab)
- **E2E** = `e2e/scheduling/schedule.spec.ts` (desktop and tablet)

## Scheduling test matrix

| Test ID | Scenario                                             | Expected                                                                           |
| ------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| M4-T01  | Assign a game to a table and sequence                | Assignment succeeds                                                                |
| M4-T02  | Reuse a sequence on the same table and round         | Rejected with `sequence_in_use`                                                    |
| M4-T03  | Assign an inactive or category-incompatible table    | Rejected with a field error                                                        |
| M4-T04  | Assign a table without a valid event judge           | Rejected                                                                           |
| M4-T05  | Generate missing games for approved team/round pairs | Preview writes nothing; successful generation creates and assigns games atomically |
| M4-T06  | No compatible table can accept a game                | `409` report; no games are written                                                 |
| M4-T07  | Two administrators edit one game                     | Stale change refused with `409`                                                    |
| M4-T08  | Validate an unassigned game                          | `missing_table` issue returned                                                     |
| M4-T09  | Schedule an archived event                           | Rejected                                                                           |

These scenarios are covered by `apps/backend/tests/m4-scheduling.test.ts`. Frontend tests verify
table/sequence editing, validation messages and generation feedback.
The E2E flow verifies a manager can configure a fixed table judge, preview without writing, generate
missing games and edit a sequence; judges remain read-only. (The coach's schedule view was removed
with the coach role, M8-A.)

## Round phases

Round records store shared `testing_minutes` and `scoring_minutes`. The UI displays both phases and
their total; games are ordered on each table during scoring rather than assigned individual start
times.

## Not covered yet

- No dedicated migration rollback test.
- Query performance of the games list with large data volumes.
- Performance with very large events has not been measured.
