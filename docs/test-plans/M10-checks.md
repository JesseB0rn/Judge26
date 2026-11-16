# Test plan: M10-B – Robot check, parts check and round file (M10-08 – M10-17)

- **Integration** = `apps/backend/tests/m10-checks.test.ts` (modes, stored checks, gates, release,
  parts check, round file, templates); `m7-security.test.ts` lists the new routes and closed
  collections. Existing tests that score create rounds with `check_mode: 'off'`.
- **Unit** = `apps/web/src/modules/judging/__tests__/{robotCheck,ScoreGameView,JudgeDashboardView,ChecksView}.spec.ts`
- **E2E** = `e2e/judging/checks-m10.spec.ts`, desktop and tablet. `createRound` in
  `e2e/support/backend.ts` creates rounds without a check unless asked.

## Tests

| Test ID | Scenario                                                     | Expected                                          | Covered by             |
| ------- | ------------------------------------------------------------ | ------------------------------------------------- | ---------------------- |
| M10-T12 | Create a round; migrate rounds with and without a check      | New: synchronous with check phase; old unchanged  | Integration            |
| M10-T13 | Check two teams on one device, open the check on another     | Both checked with judge and time                  | Integration, Unit, E2E |
| M10-T14 | Synchronous round: start a score sheet before the release    | 409 `round: not_released`; sheet locked in the UI | Integration, Unit, E2E |
| M10-T15 | All tables ready; head judge releases                        | Sheets unlock on every table without reload       | Integration, E2E       |
| M10-T16 | Release with a table not ready, without and with a reason    | 400 `reason: required`; released and audited      | Integration, Unit      |
| M10-T17 | Table judge calls the release                                | 403                                               | Integration            |
| M10-T18 | Asynchronous: open an unchecked team's sheet, then check it  | Locked with a link to the check; then unlocked    | Integration, Unit, E2E |
| M10-T19 | Head judge watches while two tables check                    | Counts and ready states; revision increases       | Integration, Unit, E2E |
| M10-T20 | Robot check off for a round                                  | No check on the timeline; scoring open            | Integration            |
| M10-T21 | Parts check block after the first scoring phase              | Stored without a round; `parts_check_late`        | Integration            |
| M10-T22 | Parts check open: robot check and scoring of the first round | 409 `parts_check: open`, covered categories only  | Integration, Unit, E2E |
| M10-T23 | All tables confirm; head judge completes                     | First round unlocks; completion audited           | Integration, Unit, E2E |
| M10-T24 | Complete with a table open; a day without the block          | 409 naming the table, then forced and audited     | Integration, Unit      |
| M10-T25 | Judge requests the round file before and after (both modes)  | 409 before; shown on check and sheet after        | Integration, Unit, E2E |
| M10-T26 | 12 MB file, a .zip, a table judge uploads, anonymous request | 400 `file`; 400 `file`; 403; 404                  | Integration            |

Additional: offline check changes are queued and an older change does not overwrite a newer one;
reopening stops once scoring started; mode is fixed after the first check (managers can still turn
it off); a release is withdrawn only while nothing was scored; asynchronous rounds accept an absent
team without a check; release and completion fields are not writable through the record API.
