# Test plan: M3 – Rounds and ranking engine

- **Engine** = `packages/ranking-engine/tests/*` (unit and property-based; thresholds 95% lines, 90% branches)
- **Integration** = `apps/backend/tests/m3-ranking.test.ts`
- **Unit** = `apps/web/src/modules/rankings/__tests__/*`
- **E2E** = `e2e/rankings/ranking.spec.ts`

M3-18 (visual aggregation builder, P2) and M3-T15 to M3-T17 are deferred and do not block the M3
exit criteria.

## Mandatory fixtures

| Fixture | Scenario                         | Test                                                                                                                   |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| M3-F01  | Addition = 100                   | Engine `fixtures` › M3-F01                                                                                             |
| M3-F02  | Maximum = 80                     | Engine `fixtures` › M3-F02                                                                                             |
| M3-F03  | Difference R1 − R2 = 50          | Engine `fixtures` › M3-F03                                                                                             |
| M3-F04  | Best result with associated time | Engine `fixtures` › M3-F04; Integration › snapshot (Alpha); Unit `RankingView` › preview; property: BEST_BY keeps time |
| M3-F05  | Sum of best two = 180            | Engine `fixtures` › M3-F05                                                                                             |
| M3-F06  | Nested aggregation = 150         | Engine `fixtures` › M3-F06                                                                                             |

## Ranking test matrix

| Test ID | Scenario                           | Tests                                                                              |
| ------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| M3-T01  | ADD three rounds = 100             | Engine `ranking` › M3-T01–T03                                                      |
| M3-T02  | MAX = 80                           | Engine `ranking` › M3-T01–T03                                                      |
| M3-T03  | MIN = 30                           | Engine `ranking` › M3-T01–T03                                                      |
| M3-T04  | Ordered difference = 50            | Engine `ranking` › M3-T04 (both orders)                                            |
| M3-T05  | Best result by points              | Engine `ranking` › M3-T05/T06                                                      |
| M3-T06  | Equal points, time-based selection | Engine `ranking` › M3-T05/T06; attempts default                                    |
| M3-T07  | Best two of three = 180            | Engine `ranking` › M3-T07                                                          |
| M3-T08  | Nested expressions = 150           | Engine `ranking` › M3-T08                                                          |
| M3-T09  | Two tie-breaking rules             | Engine `ranking` › M3-T09 (decidedBy); Integration › snapshot; E2E (total time)    |
| M3-T10  | All tie-breakers exhausted         | Engine `ranking` › M3-T10/T14 (shared and name fallback)                           |
| M3-T11  | Missing round result               | Engine `ranking` › M3-T11 (zero, exclude, unranked); status distinctions           |
| M3-T12  | Round result changes               | Engine `ranking` › M3-T12; Integration › M3-T12/T13; E2E                           |
| M3-T13  | Recalculate published ranking      | Integration › M3-T12/T13, immutability (incl. superuser); E2E (snapshot unchanged) |
| M3-T14  | Identical results                  | Engine `ranking` › M3-T10/T14; property: shared ranks equal values                 |

## Acceptance criteria

| ID       | Criterion                              | Evidence                                                                |
| -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| M3-01    | Arbitrary number of rounds             | Integration › M3-01; Unit › manages rounds; E2E                         |
| M3-02    | Games belong to exactly one round      | Integration › M3-02 (round, team category, approval, attempts)          |
| M3-03    | Round results derived from game scores | Integration › M3-03 (server-side score sheet); Unit › score sheet entry |
| M3-04–10 | Aggregations                           | Fixtures and matrix above; Engine › WORST_BY, attempts                  |
| M3-11    | Points/time association                | M3-F04; property: BEST_BY keeps time                                    |
| M3-12    | Nested aggregation                     | M3-F06, M3-T08; circular calculations rejected (Engine, Integration)    |
| M3-13    | Ranking by configured rules            | M3-T09; Engine › time ascending                                         |
| M3-14    | Tie-breaking in order                  | M3-T09                                                                  |
| M3-15    | Shared rankings                        | M3-T10/T14                                                              |
| M3-16    | Calculation preview                    | Unit `RankingView` › preview, unsaved changes; E2E (explanation)        |
| M3-17    | Ranking snapshots                      | Integration › snapshots; Unit › publish; E2E                            |

Additional correctness requirements: units and types (points scaled, time in ms), time
precision (`timeResolutionMs`, Engine › arithmetic), operand order (M3-T04), distinguishable
statuses (Engine › distinguishes…), rounding boundaries (spec), circular dependencies
(Engine `validate`, Integration).

## Status

| Layer       | Result (local, 2026-11-09)             | CI evidence    |
| ----------- | -------------------------------------- | -------------- |
| Engine      | 39 passed; 99.4% lines, 97.8% branches | pending PR run |
| Integration | 81 passed (12 for M3)                  | pending PR run |
| Unit (web)  | 129 passed                             | pending PR run |
| E2E         | 34 passed (4 consecutive runs)         | pending PR run |
