# Test plan: M5 – Judge interface and scoring workflow

- **Integration** = `apps/backend/tests/m5-judging.test.ts` (real PocketBase, migrations, hooks, routes)
- **Unit** = `apps/web/src/modules/judging/__tests__/*` (stopwatch/time/filter helpers, offline drafts,
  score sheet page, dashboard)
- **E2E** = `e2e/judging/judging.spec.ts` (desktop and tablet 768 × 1024)

## Mandatory workflow tests

| Test ID | Scenario                            | Expected                        | Covered by                                                       |
| ------- | ----------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| M5-T01  | Judge logs in                       | Judge dashboard shown           | Integration (assignments), Unit (dashboard), E2E (login → games) |
| M5-T02  | Judge opens assigned game           | Correct game displayed          | Integration, Unit, E2E                                           |
| M5-T03  | Judge opens unassigned game         | Access denied                   | Integration (`403`, no sheet reads), Unit, E2E                   |
| M5-T04  | Enter additive score                | Correct live total              | Unit, E2E                                                        |
| M5-T05  | Change exclusive option             | Previous option deselected      | Unit, E2E                                                        |
| M5-T06  | Start and stop stopwatch            | Correct duration recorded       | Unit (lib, view with fake timers), E2E                           |
| M5-T07  | Reload page with unsaved draft      | Draft restored                  | Unit (unmount/remount before autosave), E2E (reload)             |
| M5-T08  | Submit valid score sheet            | Status changes to submitted     | Integration, Unit, E2E                                           |
| M5-T09  | Submit incomplete required criteria | Submission rejected             | Integration (`400`), Unit (blocked, highlighted), E2E            |
| M5-T10  | Head judge approves score           | Status changes to finalized     | Integration (game + ranking snapshot), Unit, E2E (ranking page)  |
| M5-T11  | Judge changes finalized score       | Change denied                   | Integration (`409`/`403`, games API `409`), Unit                 |
| M5-T12  | Authorized correction               | Old and new values recorded     | Integration (audit before/after), Unit, E2E (history)            |
| M5-T13  | Disconnect during scoring           | Draft remains available         | Unit (drafts, cached page), E2E (`setOffline`)                   |
| M5-T14  | Reconnect                           | Draft synchronizes              | Unit (online event, dashboard), E2E                              |
| M5-T15  | Synchronize outdated draft          | Finalized score not overwritten | Integration (`409`), Unit (drafts, page notice)                  |

Further integration tests: older drafts (`client_saved_at`) do not overwrite newer ones; absent
and disqualified outcomes; returned sheets with reason and resubmission; the audit trail is
append-only (even for superusers) and visible only to the table judge and reviewers; direct result
edits through the games API are audited; reviewers list an event's games; archived events are
read-only; a round's day must belong to its event.

## Usability acceptance criteria

| Criterion                                         | Evidence                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Assigned game within two interactions after login | E2E: _Judging_ card → _Up next_ (both viewports)                        |
| Score changes require no page reload              | E2E/Unit: live total after each tap                                     |
| The current total is always visible               | Sticky header with the total (`live-total`)                             |
| Submission status is clearly displayed            | Status badge (colour + icon + text) in header and lists; status banners |
| Usable at 768 × 1024                              | E2E runs the full flow in the tablet project; touch targets ≥ 48 px     |
| No critical scoring action depends on hover       | All actions are buttons/links; E2E tablet project uses touch            |

## Exit criteria

"A complete game can be scored, submitted, approved and reflected in the ranking": the first E2E
test scores a game, submits it, approves and corrects it as head judge and checks the live ranking;
the integration test M5-T10 publishes a ranking snapshot after approval.

## Not covered yet

- Opening the app itself (not an already open page) without a connection: there is no service
  worker yet, so a full browser reload while offline fails before the app starts.
- Concurrent editing of one draft on two devices beyond "newest change wins".
- Configurable approval per category (roadmap question 15.4).
- Performance with realistic data volumes. The M1/M2 collection rules (events, categories, teams,
  rulesets) join `role_assignments` under several `@collection` aliases, so list requests slow down
  with the product of those tables: in the full E2E run a rulesets list with one row takes ~2.7 s.
  The judging endpoints do not use these rules, but the staff pages do. Follow-up: rewrite those
  rules (one alias per collection) with the M1 permission tests as the safety net.
