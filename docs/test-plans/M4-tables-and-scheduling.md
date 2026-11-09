# Test plan: M4 – Tables and scheduling

- **Engine** = `packages/scheduling-engine/tests/*` (unit; thresholds 95% lines, 90% branches)
- **Integration** = `apps/backend/tests/m4-scheduling.test.ts` (real PocketBase, hooks, routes)
- **Unit** = `apps/web/src/modules/scheduling/__tests__/*` (helpers, API mapping, schedule tab)
- **E2E** = `e2e/scheduling/schedule.spec.ts` (desktop and tablet)

## Mandatory fixtures

| Fixture | Scenario                                                                 | Test                                                      |
| ------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| M4-F01  | 12 teams, 3 tables, 2 rounds, 15 min games, 120 min: 24 games in 8 slots | Engine `scheduler` › M4-F01; Integration › M4-06 / M4-F01 |

## Scheduling test matrix

| Test ID | Scenario                              | Expected                     | Tests                                                                               |
| ------- | ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| M4-T01  | Assign one game to an available table | Assignment succeeds          | Engine `conflicts`; Integration › M4-05                                             |
| M4-T02  | Two simultaneous games on one table   | Second rejected              | Engine `conflicts` › M4-T02; Integration › M4-T02                                   |
| M4-T03  | One team in two simultaneous games    | Conflict                     | Engine `conflicts` › M4-T03; Integration › M4-T03                                   |
| M4-T04  | Judge in overlapping games            | Conflict; non-judge rejected | Engine `conflicts` › M4-T04; Integration › M4-T04                                   |
| M4-T05  | Game during lunch break               | Rejected                     | Engine `conflicts` › M4-T05; Integration › M4-04 / M4-T05                           |
| M4-T06  | Incompatible category on table        | Rejected                     | Engine `conflicts` › M4-T06; Integration › M4-02                                    |
| M4-T07  | Minimum rest interval                 | Constraint respected         | Engine `conflicts` › M4-T07; `scheduler` › M4-T07; Integration › M4-T07             |
| M4-T08  | Insufficient capacity                 | Clear infeasibility report   | Engine `scheduler` › M4-T08 and reasons; Integration › M4-T08 (409, nothing stored) |
| M4-T09  | Regenerate with locked games          | Locked games unchanged       | Engine `scheduler` › M4-T09; Integration › M4-T09                                   |
| M4-T10  | Games across two days                 | Correct dates                | Engine `conflicts` › M4-T10; Integration › M4-T10                                   |
| M4-T11  | Move game to another table            | Conflicts re-evaluated       | Engine `conflicts` › M4-T11; Integration › M4-T11                                   |
| M4-T12  | Two administrators edit one game      | Stale change refused (409)   | Integration › M4-T12                                                                |

## Acceptance criteria

| ID       | Criterion                       | Evidence                                                       |
| -------- | ------------------------------- | -------------------------------------------------------------- |
| M4-01    | Tables create, edit, deactivate | Integration › M4-01, M4-11                                     |
| M4-02    | Category restrictions           | Integration › M4-02; Engine › M4-T06                           |
| M4-03    | Availability periods            | Integration › M4-03; Engine › outside availability, no periods |
| M4-04    | Breaks respected                | Integration › M4-04; Engine › M4-T05                           |
| M4-05    | Manual assignment               | Integration › M4-05                                            |
| M4-06    | Automatic generation            | Engine › M4-F01; Integration › M4-06                           |
| M4-07–10 | Team, table, judge, rest        | Engine › conflicts; Integration › M4-T02–T04, T07              |
| M4-11    | Schedule editing                | Integration › M4-T11, M4-11                                    |
| M4-12    | Locked assignments              | Engine › M4-T09; Integration › M4-T09                          |
| M4-13    | Actionable errors               | Integration › field and code per rule; validation endpoint     |
| M4-14    | Multi-day                       | Integration › M4-T10                                           |

The E2E flow covers setup of a table and an availability period, preview and generation, manual
judge assignment, a rejected move onto an occupied slot (M4-T11), read-only access for judges,
and the coach's view of their team's schedule. The placement dialog has its own unit tests
(prefill, save with version, 409 reload message, field conflict message).

## Not covered yet

- No dedicated migration rollback test.
- Query performance of the games list with large data volumes (see the query note in the spec).
- Performance with large events: not measured. Generation loads the event for every saved game.
