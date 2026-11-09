# Test plan: M2 – Configurable scoring engine

- **Engine** = `packages/scoring-engine/tests/*` (pure unit and property-based tests, CI job _checks_;
  thresholds 95% lines, 90% branches)
- **Integration** = `apps/backend/tests/m2-rulesets.test.ts` (bundled engine inside PocketBase)
- **Unit** = `apps/web/src/modules/scoring/__tests__/*`
- **E2E** = `e2e/scoring/rulesets.spec.ts`

## Mandatory fixtures

| Fixture | Scenario                    | Test                                                                                           |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| M2-F01  | Additive scoring = 45       | Engine `fixtures` › M2-F01                                                                     |
| M2-F02  | Mutually exclusive criteria | Engine `fixtures` › M2-F02 (A, B, both rejected, empty required group rejected); E2E (parking) |
| M2-F03  | Penalties = 35              | Engine `fixtures` › M2-F03                                                                     |
| M2-F04  | Nested groups = 45          | Engine `fixtures` › M2-F04                                                                     |
| M2-F05  | Conditional bonus           | Engine `fixtures` › M2-F05; Unit `ScoreSheet` › conditional; E2E (tower bonus)                 |

## Roadmap tests

| Test ID | Scenario                                  | Tests                                                                                               |
| ------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| M2-T01  | Negative value to positive-only criterion | Engine `evaluate` › M2-T01                                                                          |
| M2-T02  | Value above maximum                       | Engine `evaluate` › M2-T02; Unit `ScoreSheet` › issues                                              |
| M2-T03  | Decimal to integer criterion              | Engine `evaluate` › M2-T03; Integration › same engine                                               |
| M2-T04  | Two exclusive options                     | Engine `fixtures` › M2-F02 both; Integration › same engine                                          |
| M2-T05  | Nested expression                         | Engine `evaluate` › M2-T05                                                                          |
| M2-T06  | Empty optional group                      | Engine `evaluate` › M2-T06                                                                          |
| M2-T07  | Negative final score                      | Engine `evaluate` › M2-T07; property: clamps respected                                              |
| M2-T08  | Reference nonexistent criterion           | Engine `validate` › M2-T08; Integration › M2-T08; E2E (ghost)                                       |
| M2-T09  | Circular expression reference             | Engine `validate` › M2-T09 (pair, self, chain, descendant); Integration › M2-T09                    |
| M2-T10  | Modify active template                    | Integration › M2-T10 (incl. superuser); Engine › M2-14 isolation; Unit `RulesetsView` › M2-T10; E2E |
| M2-T11  | Recalculate historical score              | Integration › M2-T11; E2E (version 1 still scores 10)                                               |
| M2-T12  | Identical input twice                     | Engine `evaluate` › M2-T12; property: deterministic, key order                                      |

## Acceptance criteria

| ID    | Criterion                       | Evidence                                                                 |
| ----- | ------------------------------- | ------------------------------------------------------------------------ |
| M2-01 | Type, limits, instructions      | Spec; Engine `validate` › nodes; Unit `ScoreSheet` renders descriptions  |
| M2-02 | Boolean criteria                | Engine `evaluate` › M2-02                                                |
| M2-03 | Numeric criteria validated      | Engine › M2-T01–T03, M2-03 exact decimals, rounding                      |
| M2-04 | Selection criteria              | Engine `evaluate` › M2-04                                                |
| M2-05 | Exclusive groups                | M2-F02; Engine `sheet` › exclusive deselection                           |
| M2-06 | Additive groups                 | M2-F01; property: SUM exact and order-independent                        |
| M2-07 | Deductions                      | M2-F03; Engine › deduction groups; property: deductions never increase   |
| M2-08 | MAX groups                      | Engine › M2-08/09; property: MAX bounds                                  |
| M2-09 | MIN groups                      | Engine › M2-08/09; property: MIN bounds                                  |
| M2-10 | Conditional criteria            | M2-F05; Engine `conditions`; Engine `sheet` › clearing                   |
| M2-11 | Nested groups                   | M2-F04, M2-T05                                                           |
| M2-12 | Invalid configurations rejected | Engine `validate` (all codes); Integration › publish validation          |
| M2-13 | Score explanation               | Engine › example explanation, formulas; Unit `RulesetsView` preview; E2E |
| M2-14 | Configuration versioning        | M2-T10, M2-T11; Integration › copy carries active version                |

M2-15 (visual rule builder, P2) and its tests M2-T13 to M2-T15 are not yet implemented and
do not block the M2 exit criteria.

## Exit criteria

- _All fixtures and automated tests pass_ — see Status.
- _The scoring engine operates independently of Vue and PocketBase_ — `packages/scoring-engine`
  has no runtime dependencies; its tests run without either.

## Status

| Layer       | Result (local, 2026-11-09)             | CI evidence    |
| ----------- | -------------------------------------- | -------------- |
| Engine      | 54 passed; 99.8% lines, 97.9% branches | pending PR run |
| Integration | 68 passed (12 for M2)                  | pending PR run |
| Unit (web)  | 116 passed                             | pending PR run |
| E2E         | 30 passed                              | pending PR run |
