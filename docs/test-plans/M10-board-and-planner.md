# Test plan: M10-D and M10-E – Planner editing and board fixes (M10-21 – M10-29)

- **Integration** = `apps/backend/tests/m10-board-planner.test.ts` (label scheme and relabel, multi-team
  placement, day-time versioning, atomic batch shifts); `m7-security.test.ts` lists the new
  endpoint
- **Unit** = `apps/web/src/modules/board/__tests__/AssignmentBoard.spec.ts` (busy layout, wrapping,
  tray selection, multi-drag, selection after drags), `apps/web/src/modules/planner/__tests__/lib.spec.ts`
  (columns of items, later items, shifts), `apps/web/src/modules/planner/__tests__/PlannerBoard.spec.ts`
  (single and double click, multi-column create, day-time buttons)
- **E2E** = `e2e/board/board-m10.spec.ts` and `e2e/planner/planner-m10.spec.ts` (desktop and tablet)

## Features

| ID     | Feature              | Covered by                                                                                                 |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| M10-21 | Day times in planner | Integration (versioned, 409, items flagged not moved, no version for the public), Unit (buttons), E2E      |
| M10-22 | Block over columns   | Unit (coverage of the dragged columns), E2E (block stored with three categories)                           |
| M10-23 | Dialog on double     | Unit (single click: nothing; double click: dialog; not on blocks), E2E                                     |
| M10-24 | Fix: move later      | Unit (column chains, per-column start, same-time items, midnight), Integration (batch all or nothing), E2E |
| M10-25 | Table label scheme   | Integration (next label, AA after Z, relabel, 409, language of the word, templates), E2E                   |
| M10-26 | Fix: board scroll    | Unit (controls disabled, not removed, while saving), E2E (fails with the old behaviour: 48 px jump)        |
| M10-27 | Wrapping categories  | Unit (wrapping groups), E2E (rows at 1024 px, no page scroll; dividers across rows on tablets)             |
| M10-28 | Multi-select teams   | Integration (one write, order, refused as a whole, 409), Unit (selection, multi-drag), E2E                 |
| M10-29 | Fix: text selection  | Unit (board and planner drags, dropped and cancelled), E2E (no selection after Shift+click and drag)       |

## Tests

| Test ID | Scenario                                       | Expected                                            | Covered by                       |
| ------- | ---------------------------------------------- | --------------------------------------------------- | -------------------------------- |
| M10-T33 | Move a day's start past its first item; stale  | Saved, item flagged; 409                            | Integration, E2E                 |
| M10-T34 | Drag across three category columns             | One block covering the three categories             | Unit, E2E                        |
| M10-T35 | Single click, then double click on empty space | Nothing; dialog with that day, column and time      | Unit, E2E                        |
| M10-T36 | Move later: second of four items, +15 min      | Items 2 to 4 shift 15 min; item 1 stays             | Unit, E2E                        |
| M10-T37 | A later block spans columns A and B            | Later items of B shift; earlier items of B stay     | Unit, E2E                        |
| M10-T38 | Shift past the day's end; undo a valid shift   | Nothing moves, reason shown; undo restores all      | Unit, Integration (batch), E2E   |
| M10-T39 | Scheme "A": three tables; relabel; 27th letter | A, B, C; Table 1 to 3 in board order; AA            | Integration, E2E                 |
| M10-T40 | Scroll right, assign; another user moves       | Scroll position unchanged both times                | E2E                              |
| M10-T41 | Three categories at 1024 px; divider drag      | Groups wrap, no page scroll; table changes category | Unit, E2E (and M8-T17 on tablet) |
| M10-T42 | Shift-select three teams and drop them         | Placed in tray order with one write                 | Integration, Unit, E2E           |
| M10-T43 | Selection with a team of another category      | Drop refused; nothing placed                        | Integration, Unit, E2E           |
| M10-T44 | Drag and drop, and cancel, on board/planner    | Nothing selected afterwards                         | Unit, E2E                        |

The board has no undo; M10-28 is "one write" (M10-T42 dropped its undo step accordingly).
