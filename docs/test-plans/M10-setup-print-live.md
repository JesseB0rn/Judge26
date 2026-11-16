# Test plan: M10-F – Setup, print center and live (M10-30 – M10-36)

- **Integration** = `apps/backend/tests/m10-print.test.ts` (payload, access);
  `m7-security.test.ts` lists the route
- **Unit** = `apps/web/src/modules/print/__tests__/PrintCenterView.spec.ts` (page builders, view),
  `modules/templates/__tests__/views.spec.ts` (checklist publish),
  `modules/live/__tests__/{views,progress-segments}.spec.ts` (TV QR code, segments)
- **E2E** = `e2e/print/print-center-m10.spec.ts` and `e2e/live/setup-live-m10.spec.ts`, desktop and
  tablet (A4 size on screen; in
  Chromium the printed PDF has exactly one A4 page per selected team)

| Test ID | Scenario                                                    | Expected                                               | Covered by             |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------ | ---------------------- |
| M10-T45 | Checklist incomplete, then publish from the bottom button   | Button like the header's; event published              | Unit, E2E              |
| M10-T46 | Print parking labels for one category; a judge opens it     | One A4 page per team with name and category; denied    | Integration, Unit, E2E |
| M10-T47 | Workplace sheet of a team with games on two days            | All its phases and games with time and table; judges   | Integration, Unit      |
| M10-T48 | Table assignment of a round in the three variants           | One page per table; teams / judges / both; play order  | Unit, E2E              |
| M10-T49 | Decode the TV view's QR code; TV view of a non-public event | Public live ranking address; no code                   | Unit, E2E              |
| M10-T50 | Day with rounds of 8 and 4 games, 6 and 0 finished          | Two segments 2:1; first filled to 75 %; counts in text | Unit, E2E              |

Additional: leaving records out of the selection prints one page per remaining record; teams of
other categories and unapproved teams are not listed; the QR poster and the staff QR code on the
live page point to the live ranking. M10-T49 checks that the SVG is the code of the expected
address (same library, same options) rather than decoding a picture.
