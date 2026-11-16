# M10-C – Run times: zero-point time and precision

Refines roadmap requirements M10-18 – M10-20.

## Time for zero-point runs (M10-18)

A ruleset may set `zeroPointsTimeMs` (0 – 3 600 000). A **completed** run that scores exactly
**0 points** under that ruleset then counts with this time instead of the measured one.

- **Where:** the games hook (`hooks/lib/games.js`) computes points from the ruleset values and
  sets the game's `time_ms` to the counted time (`countedTimeMs` in the scoring engine). The game
  is what rankings read. The **score sheet keeps the measured time**, and so does its history
  (`score_audit`), so the measured value is never lost.
- **Default:** a category's **first** ruleset starts from the example with `zeroPointsTimeMs:
120000` (on, 120 s). A new version copies its base, so existing rulesets keep their behaviour.
  Rulesets without the property (all written before M10) count the measured time.
- **History (M2-14):** a finalized game stays tied to the ruleset version it was scored with;
  saving the game again applies that version's rule, never a newer one's.
- **Editor:** the ruleset inspector (root node) has _Count zero-point runs with a fixed time_ and
  the time in seconds.
- **Score sheet:** with 0 points the sheet says that the run counts as e.g. 2:00 and that the
  measured time stays on the sheet; the submit summary shows both.
- Games without a ruleset (manually entered points) are not affected.

## Run time precision (M10-19)

`events.time_decimals`: 0 (whole seconds, default; also when empty), 1 (tenths), 2 (hundredths)
or 3 (thousandths). Set in the event form; event templates carry it (`event.time_decimals`,
optional).

Times are shown as **minutes:seconds** with that many decimals and **cut, not rounded**
(`formatRunTime` in the ranking engine): 95 379 ms → 1:35, 1:35.3, 1:35.37, 1:35.379. This
applies to the stopwatch and manual time, the score sheet and its history, the judge dashboard,
the review queue, the results matrix, rankings (staff, public live, TV, printed report, result
explanations) and the exported times. Exports write **seconds** as numbers (e.g. 95.3), with the
decimals of the ranking, so spreadsheets can compute with them.

Measured times are always stored to the millisecond.

## Precision in ranking (M10-20)

Before ranking, times are cut to the event's precision: the ranking uses the **coarser** of the
configuration's own `timeResolutionMs` and `10^(3 − decimals)` ms (`withTimeDecimals`). Times
shown as equal therefore rank as equal (the next key decides). Where this applies:

| Ranking                       | Configuration used                                          |
| ----------------------------- | ----------------------------------------------------------- |
| Public live ranking (server)  | Category configuration with the event's precision           |
| New snapshot (server)         | Same; the snapshot **stores** it with its inputs and result |
| Staff preview, printed report | Same, computed in the browser                               |
| Category templates            | As configured (no event)                                    |

Changing the precision recalculates live rankings at once; published snapshots keep the
configuration and result they were computed with. Ranking displays take their decimals from the
configuration's resolution (1000 ms → 0, 100 → 1, 10 → 2, 1 → 3; other values show
milliseconds), so a snapshot shows times as precisely as it ranked them.

## Data

| Change                       | Notes                                                    |
| ---------------------------- | -------------------------------------------------------- |
| `events.time_decimals`       | Number 0–3; migration `1765200000_m10_time_precision.js` |
| Ruleset `zeroPointsTimeMs`   | Optional definition property, validated on publish       |
| `games.time_ms`              | The counted time (zero-point rule applied)               |
| `score_sheets.time_ms`       | The measured time                                        |
| Score sheet / judge payloads | `event.time_decimals`                                    |
