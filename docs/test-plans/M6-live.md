# Test plan: M6 – Live competition and public interface

- **Integration** = `apps/backend/tests/m6-live.test.ts` (real PocketBase, migrations, hooks, routes)
- **Unit** = `apps/web/src/modules/live/__tests__/*` (pure logic, live updates, cache, views, TV mode,
  publication panel) and `apps/web/src/modules/rankings/__tests__/views.spec.ts` (staff live ranking)
- **E2E** = `e2e/live/live.spec.ts` (desktop; public pages and TV displays are not tablet workflows)

## Features

| ID    | Feature                | Covered by                                                                       |
| ----- | ---------------------- | -------------------------------------------------------------------------------- |
| M6-01 | Live rankings          | Integration (live ranking, revisions), Unit (`useLiveUpdates`, RankingView), E2E |
| M6-02 | Provisional rankings   | Integration (`provisional`, progress), Unit (lib, views), E2E                    |
| M6-03 | Public leaderboard     | Integration (guest access), Unit, E2E (signed-out page)                          |
| M6-04 | Schedule display       | Integration (states, no private data), Unit (lib, views), E2E                    |
| M6-05 | TV mode                | Unit (rotation, pinned view), E2E                                                |
| M6-06 | Category filtering     | Unit (lib, views)                                                                |
| M6-07 | Day filtering          | Unit (lib, views)                                                                |
| M6-08 | Competition progress   | Integration (counts), Unit (lib, views), E2E                                     |
| M6-09 | Multi-day continuation | Integration (restart), Unit (current day)                                        |
| M6-10 | Result publication     | Integration (rules, validation, timestamps), Unit (panel), E2E (manager UI)      |

## Tests

| Test ID | Scenario                            | Expected                         | Covered by                                                                     |
| ------- | ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| M6-T01  | Finalize score                      | Ranking updates                  | Integration (submitted not counted, approved counted), Unit, E2E (no reload)   |
| M6-T02  | Change authorized score             | Ranking recalculated             | Integration (correction), Unit (RankingView reload)                            |
| M6-T03  | Publish results                     | Public can access them           | Integration, E2E (manager publishes, guest sees)                               |
| M6-T04  | Unpublished results                 | Hidden from public               | Integration (null rankings, draft events `404`, collections closed), Unit, E2E |
| M6-T05  | Filter category                     | Only selected category displayed | Unit (views: ranking and schedule)                                             |
| M6-T06  | Switch competition day              | Correct games displayed          | Unit (views, lib)                                                              |
| M6-T07  | Open TV mode                        | No administration controls       | Unit (whole app as admin), E2E (signed-in manager)                             |
| M6-T08  | Restart event after overnight break | All existing results preserved   | Integration (server stopped and restarted on the same data, day 2 continues)   |
| M6-T09  | Refresh public leaderboard          | Current published data retained  | Integration (identical responses), Unit (cache, failed reloads), E2E (reload)  |

Further integration tests: only managers publish; only snapshots of the category; publication
timestamps cannot be forged; official rankings are not changed by later corrections; draft autosaves
do not signal changes; revisions are not writable; public payloads contain no contact data, members or
points; the migration adds the fields and the unique revision index.

## Exit criteria

"Judges, administrators and public displays can operate simultaneously without inconsistent result
states": the live ranking is computed on the server from finalized games only (the same inputs as
snapshots), the official ranking is an immutable snapshot, and every client reloads after each
committed change (E2E: a result recorded by staff appears on an open public page without reload).

## Not covered yet

- Load with many simultaneous displays (each change reloads every display; the payloads are computed
  per request without caching).
- The full E2E run shows the pre-existing slowness of the M1/M2 access rules (see the M5 test plan):
  the ruleset list takes ~1.5 s by the end of a run, so the ruleset E2E test waits up to 15 s after a
  save. Rewriting those rules remains a follow-up.
