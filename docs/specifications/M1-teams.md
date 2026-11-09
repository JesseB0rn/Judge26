# M1 – Team registration, approval and import

Refines roadmap requirements M1-10, M1-11 and M1-12.

## Registration data

| Field                                        | Notes                                                           |
| -------------------------------------------- | --------------------------------------------------------------- |
| `event`, `category`                          | The category must belong to the event                           |
| `name`                                       | Unique per category, case-insensitive; max. 100 characters      |
| `organization`, `country`                    | Optional                                                        |
| `coach`                                      | Owning account. Empty for imported teams without an account yet |
| `coach_name`, `coach_email`                  | Contact details; default from the coach's account               |
| `members`                                    | `[{ first_name, last_name, birth_year }]`                       |
| `status`                                     | `draft`, `submitted`, `approved`, `rejected`, `withdrawn`       |
| `review_note`                                | Required when rejecting; shown to the coach                     |
| `submitted_at`, `reviewed_at`, `reviewed_by` | Set by the server                                               |

A coach can register any number of teams (roadmap question 15.2).

## Validation

Always: members must be a list; each member needs a first name, last name and a whole-number
birth year between 1900 and 2100.

For `submitted` and `approved` teams additionally:

- at least one member, and the category's `min_team_size` / `max_team_size`;
- each member's age within `min_age` / `max_age`, where **age = event season − birth year**
  (the WRO convention). Limits of 0 mean "no limit".

On approval, the number of approved teams in the category may not exceed `max_teams` (0 =
unlimited).

The same rules are implemented in the frontend (`apps/web/src/modules/teams/lib.ts`) for
immediate feedback and in the backend (`apps/backend/hooks/lib/teams.js`) for enforcement.

## Status workflow

| From        | Allowed targets                               |
| ----------- | --------------------------------------------- |
| `draft`     | `submitted`, `withdrawn`                      |
| `submitted` | `approved`, `rejected`, `draft`, `withdrawn`  |
| `approved`  | `rejected`, `withdrawn`                       |
| `rejected`  | `draft`, `submitted`, `approved`, `withdrawn` |
| `withdrawn` | `draft`                                       |

Coaches may only move their own registrations from `draft`/`rejected` to `draft`/`submitted`
while registration is open. Staff create registrations in `draft`, `submitted` or `approved`.

## CSV import (M1-12)

Available to managers on the event's Teams tab.

**Format.** UTF-8 CSV with a header row. Column order and header case are free.

| Column                                                                | Required | Notes                                         |
| --------------------------------------------------------------------- | -------- | --------------------------------------------- |
| `team_name`                                                           | yes      |                                               |
| `category_code`                                                       | yes      | Code of a category in the event (any case)    |
| `coach_email`                                                         | yes      | Linked to an existing account with that email |
| `organization`, `country`, `coach_name`                               | no       |                                               |
| `member<N>_first_name`, `member<N>_last_name`, `member<N>_birth_year` | no       | N = 1, 2, …                                   |

At most 500 rows per file. An example file can be downloaded from the import dialog.

**Import policy.**

1. The file is parsed and every row is validated in the browser against the same rules as
   above (completeness rules apply when the chosen initial status is `submitted` or
   `approved`), plus duplicate names within the file and against existing teams.
2. Invalid rows are listed with their line number and all problems, and are skipped.
3. All valid rows are sent in **one batch request**, which PocketBase executes in a single
   transaction. If the server rejects any row (e.g. a concurrent change), **nothing** is
   imported and the error is shown.
