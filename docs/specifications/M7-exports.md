# M7 – Exports and printable results

Refines roadmap tasks M7-05 – M7-07. Staff download teams, games and rankings as CSV or Excel
files, and print ranking reports (or save them as PDF).

Exports are generated **in the browser** from the data the page already shows. They therefore
contain exactly what the user may see (the API rules apply unchanged) and exactly what is on the
screen (filters, the live ranking or the selected snapshot). Nothing is sent to the server.

## Where

| Page                                | Export          | Who                         | Content                                                          |
| ----------------------------------- | --------------- | --------------------------- | ---------------------------------------------------------------- |
| Event → **Teams**                   | CSV, Excel      | event staff                 | Teams as filtered; Excel adds a _Members_ sheet                  |
| Event → **Schedule**                | CSV, Excel      | event staff                 | All games in playing order with their results                    |
| Category → **Ranking**              | CSV, Excel, PDF | anyone who can see the page | The live ranking; Excel adds a _Results_ sheet                   |
| Category → **Snapshots** (selected) | CSV, Excel, PDF | anyone who can see the page | The snapshot exactly as published (its stored inputs and result) |

The ranking export is disabled while the configuration has unsaved changes (the preview would not
match the saved ranking). File names are `<title>-<date>.<csv|xlsx>`, e.g.
`ranking-robomission-junior-2026-06-01.csv`.

## Columns

**Ranking:** Rank, Shared (`yes` for shared ranks), Team, Organization, Country, one column per
ranking key (e.g. Total, Time (s)), then per round `<round> points`, `<round> time (s)` and
`<round> status` (empty when the round has a result, otherwise `missing`, `disqualified`, `absent`
or `excluded`), Provisional (`yes` if a round result is missing), Decided by (the key that placed
the team below the previous one, `Name` for the name tie-break, empty for the first or a shared
rank).

**Results:** Team, Round, Attempt, Status, Points, Time (s): one row per game that entered the
ranking.

**Teams:** Team, Category, Status, Organization, Country, Coach, Coach email, Members (count),
Submitted, Reviewed, Review note. **Members:** Team, Category, First name, Last name, Birth year,
Age in `<season>` (season − birth year, as in registration checks).

**Games:** Category, Round, Attempt, Day, Table, Position, Team, Status, Points, Time (s); sorted by
category, round, table and position. Points and time only for completed games.

## Formats

**CSV (M7-05):** RFC 4180, comma separated, CRLF line ends, UTF-8 with byte order mark (so Excel
reads umlauts correctly). Numbers are exact (no rounding) with `.` as decimal separator; times in
seconds with three decimals; dates `YYYY-MM-DD` and date-times `YYYY-MM-DD HH:MM` in local time.
Text starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'` so spreadsheet
programs never run it as a formula (CSV injection).

**Excel (M7-06):** `.xlsx` (Office Open XML) with one sheet per table. Bold, shaded header row that
stays visible when scrolling, with filters; column widths from the content. Cells are typed:
points with the ranking's precision (`config.precision` decimals), times as seconds with three
decimals, dates and date-times as real dates. Written by `apps/web/src/shared/export/xlsx.ts`
(zipped with `fflate`).

**PDF (M7-07):** _PDF_ opens the printable report `/categories/{id}/ranking/report` (live ranking)
or `…/report?snapshot={id}` (a snapshot) without the application shell. It shows the event (name,
season, venue), category and code, the title (snapshot title, or _Live ranking_ /
_Live ranking (provisional)_), rank, team, organization and the ranking keys; provisional teams are
marked `*`, shared ranks `=`. Snapshots show their creation time and fingerprint. _Print / save as
PDF_ opens the browser's print dialog; the page is laid out for A4 and prints without navigation or
buttons.
