# Test plan: M7 – Exports (M7-05 – M7-07)

- **Unit** = `apps/web/src/shared/export/__tests__/*` (CSV, XLSX writer, buttons, file names),
  `apps/web/src/modules/{rankings,teams,scheduling}/__tests__/export.spec.ts` (exported data),
  `apps/web/src/modules/rankings/__tests__/report.spec.ts` (report), and the views specs of rankings
  and teams (buttons export what is shown)
- **E2E** = `e2e/exports/exports.spec.ts` (desktop; real downloads and a PDF printed by Chromium)

## Features

| ID    | Feature     | Covered by                                                                                        |
| ----- | ----------- | ------------------------------------------------------------------------------------------------- |
| M7-05 | CSV export  | Unit (quoting, numbers, times, dates, BOM, formula neutralization; teams, games, ranking), E2E    |
| M7-06 | XLSX export | Unit (workbook parts, typed cells, header style, frozen row, filters, number formats), E2E        |
| M7-07 | PDF results | Unit (live and snapshot report, provisional, missing snapshot/configuration, print), E2E (`%PDF`) |

## Tests

| Test ID | Scenario               | Expected                       | Covered by                                                                     |
| ------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| M7-T04  | Export ranking to CSV  | Correct data and values        | Unit (exact CSV of an engine-computed ranking and its results), E2E (download) |
| M7-T05  | Export ranking to XLSX | Correct columns and formatting | Unit (headers, number formats per column), E2E (valid package downloaded)      |
| M7-T06  | Generate PDF ranking   | Correct category and ranking   | Unit (event, category, rows), E2E (report content, print layout, PDF file)     |

Manually verified: a generated workbook opens in openpyxl with typed values, formats, the frozen
header and the filter.
