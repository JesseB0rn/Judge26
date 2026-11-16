# Test plan: M10-A – Judge workflow at the table (M10-01 – M10-07)

- **Integration** = `apps/backend/tests/m10-judge-workflow.test.ts` (sign-off rules, clearing on
  mulligan and return, table list, per-table access); existing submission helpers send the
  team's confirmation
- **Unit** = `apps/web/src/modules/judging/__tests__/{ScoreGameView,JudgeDashboardView,HeadJudgeTablesView,SlideToConfirm}.spec.ts`
- **E2E** = `e2e/judging/judge-workflow-m10.spec.ts` (head judge at a table, long names at 360 px,
  header time, step view) and `e2e/judging/judging.spec.ts` (real slider drag in the dialog,
  return to the dashboard), desktop and tablet

## Tests

| Test ID | Scenario                                                  | Expected                                       | Covered by             |
| ------- | --------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| M10-T01 | Judge opens the dashboard, the robot check and a sheet    | Table (and category) shown on all three        | Unit, E2E              |
| M10-T02 | Judge confirms a score on a sheet opened by direct link   | Judge dashboard; next open item marked         | Unit, E2E              |
| M10-T03 | Enter a time, then edit it                                | Header shows it in the event's precision       | Unit, E2E              |
| M10-T04 | Long team name at 360 px                                  | Whole name readable, no page scroll            | Unit, E2E              |
| M10-T05 | Step view: enter values, switch views, reload             | Same values; one draft; view remembered        | Unit, E2E              |
| M10-T06 | Step through to the summary and submit                    | Summary; normal submit flow                    | Unit                   |
| M10-T07 | Submit without confirmation or refusal                    | Button disabled; API 400 `team_confirmation`   | Integration, Unit, E2E |
| M10-T08 | Release halfway, slide to the end, grant a mulligan       | Not confirmed; confirmed with time; cleared    | Integration, Unit, E2E |
| M10-T09 | Refusals off / on without and with a reason               | `refusal: not_allowed`; `reason: required`; ok | Integration, Unit      |
| M10-T10 | Head judge picks a table and scores                       | Sheet by the head judge; board unchanged       | Integration, Unit, E2E |
| M10-T11 | Head judge of another event, or a judge, requests a table | 403                                            | Integration            |
