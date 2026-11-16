# M10-F – Setup, print center and live

Implements M10-30 – M10-36 of the roadmap.

## Publish in the checklist (M10-30)

The _Publish_ row of the setup checklist (M8-20) has its own _Publish_ button with the same state
and rules as the one in the page header: shown to event managers while the event is a draft, it
publishes the event; the checklist then reloads and the row is done.

# Print center

Code: `apps/backend/hooks/lib/print.js` and `hooks/print.pb.js`; web `modules/print`
(`PrintCenterView.vue`, page builders in `lib.ts`). Tests: `docs/test-plans/M10-setup-print-live.md`.

## Access and data (M10-31)

- **Who**: event managers, head judges and admins of the event (the _Print center_ button on the
  event page). Judges and staff of other events get 403 (`print_not_allowed`).
- `GET /api/events/{id}/print` returns in one response: the event, its days and categories, the
  rounds with their planner phases (maintenance, robot check, scoring; unplaced phases have no day
  and time), the active tables in board order with their judges' names, and the approved teams
  with their games (round, attempt, table, position).

## Print center page

`/events/{id}/print?kind=&category=&day=&round=&variant=` (filters kept in the URL):

- **Printout**: robot parking labels, workplace sheets, table assignments or, while the event is
  public, the QR code poster (M10-35).
- **Filters**: category and day. A team matches a day when one of its games is in a round scored
  that day; for table assignments the day narrows the rounds.
- **Selection**: every matching record is printed; single records can be left out (or all / none
  selected). The print button names the page count.
- **Pages**: one A4 sheet per record, previewed on screen at A4 size. _Print / save as PDF_ opens
  the browser's print dialog, like the reports of M7-07. While the page is open the print layout
  is A4 without margins (each sheet has its own 18 mm padding); other printouts keep the browser's
  settings.
- Teams are ordered by category code, then name; tables in board order.

## Printouts

| Printout                      | One page per     | Content                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robot parking (M10-32)        | team             | Team name (72 pt, smaller for long names so it still fits), category with code, organization; readable from 2 m                                                                                                                         |
| Workplace sheet (M10-33)      | team             | Team name, category, organization; its game tables with the judges' names; schedule: per round the practice and robot check phases (day, time range), then each game (day, "from" the start of the scoring run, table, position)        |
| Table assignment (M10-34)     | table of a round | Table name, round, category and day; variant _teams only_ (teams in playing order with organization and attempt), _judges only_, or _both_                                                                                              |
| Table assignment, single page | category         | Layout _Single page per category_: for a round key (R1, R2, …; categories share them), one page per category with a table of all its tables: table, judges, teams in playing order (with organization); the variant decides the columns |

A game has no time of its own; the workplace sheet shows the start of the round's scoring run, as
the judge dashboard does (M4-14-30).

## QR code to the live ranking (M10-35)

- The code points to the public live ranking, `<origin>/live/{event}?tab=rankings`. It is
  generated in the browser (`qrcode` library, SVG); nothing is sent to another service.
- It is only shown while the event is public (published or archived): the TV view of a draft
  event has no data, the print center offers no poster.
- **Live event page**: event staff see a _QR code_ button in the header that opens the code with
  the address.
- **TV view**: the code is shown in the bottom right corner with the caption _Live ranking_;
  `qr=0` in the address hides it.
- **Print center**: _QR code poster_, one A4 page with the event name, the code (130 mm) and the
  address.

## Progress per round (M10-36)

The progress bars of the live page (_Progress_ tab: all categories and each category, for the
selected day) and the TV progress slide are divided into one segment per round, in day and round
order. Each segment is as wide as its share of the bar's games and filled by its own finished
games (and those in review). Each segment carries its counts as a tooltip; below the bar the
rounds are listed as "Round 1 · RM-J: 6 of 8", which screen readers read as well (on the TV the
bar has the same text as its label).
