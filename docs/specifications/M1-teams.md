# M1 / M8-A – Teams, import and documents

Refines roadmap requirements M1-12, M1-13 and M8-01 – M8-05. Team self-registration by coaches
(M1-10, M1-11) was retired after the p1 user tests (M8-A): teams are created by event managers,
mainly by CSV import. A later extension pulls teams from an external source over an API (M8-05).

## Team data

| Field                                        | Notes                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `event`, `category`                          | The category must belong to the event                                    |
| `name`                                       | Unique per category, case-insensitive; max. 100 characters               |
| `organization`, `country`                    | Optional                                                                 |
| `coach_name`, `coach_email`                  | The team's optional **contact** (shown as "Contact"); gets schedule mail |
| `members`                                    | `[{ first_name, last_name, birth_year }]`                                |
| `status`                                     | `approved` (shown as **Active**) or `withdrawn`; see below               |
| `coach`                                      | Unused since M8-A; grants nothing. Kept so older records stay valid      |
| `review_note`                                | Only on teams registered before M8-A                                     |
| `submitted_at`, `reviewed_at`, `reviewed_by` | Set by the server                                                        |

The field names stay as they are; only what users see changed. A contact with an account does not
get access to the team.

## Validation

Always: members must be a list; each member needs a first name, last name and a whole-number
birth year between 1900 and 2100.

Active teams additionally need:

- at least one member, and the category's `min_team_size` / `max_team_size`;
- each member's age within `min_age` / `max_age`, where **age = event season − birth year**
  (the WRO convention). Limits of 0 mean "no limit".

The number of active teams in a category may not exceed `max_teams` (0 = unlimited).

The same rules are implemented in the frontend (`apps/web/src/modules/teams/lib.ts`) for
immediate feedback and in the backend (`apps/backend/hooks/lib/teams.js`) for enforcement.

## Status

New teams (created or imported) are active. Managers withdraw a team and activate it again from
the team page. Withdrawn teams may be incomplete.

| From                               | Allowed targets         |
| ---------------------------------- | ----------------------- |
| `approved`                         | `withdrawn`             |
| `withdrawn`                        | `approved`              |
| `draft`, `submitted`, `rejected` ¹ | `approved`, `withdrawn` |

¹ Teams registered before M8-A. They are listed with their old status and can be activated or
withdrawn; no team can enter these statuses any more.

## Access

- **Read:** the event's staff (managers, head judges, judges) and admins. Other users, also
  accounts that were linked to a team as its coach before M8-A, see no teams.
- **Create and update:** admins and the event's managers, while the event is not archived.
- **Delete:** admins.

Migration `1764400000_m8_retire_coach.js` removed every access rule term that used `teams.coach`
(own teams, games and documents; archived events with an own team; self-registration). Its `down`
restores the previous rules exactly.

## CSV import (M1-12, M8-03)

Available to managers on the event's Teams tab, next to **Add team**.

**Format.** UTF-8 CSV with a header row. Column order and header case are free.

| Column                                                                | Required | Notes                                      |
| --------------------------------------------------------------------- | -------- | ------------------------------------------ |
| `team_name`                                                           | yes      |                                            |
| `category_code`                                                       | yes      | Code of a category in the event (any case) |
| `organization`, `country`                                             | no       |                                            |
| `contact_name`, `contact_email`                                       | no       | The team's contact; the email is validated |
| `member<N>_first_name`, `member<N>_last_name`, `member<N>_birth_year` | no       | N = 1, 2, …                                |

At most 500 rows per file. An example file can be downloaded from the import dialog.

**Import policy.**

1. The file is parsed and every row is validated in the browser against the same rules as
   above (imported teams are active, so the completeness rules always apply), plus duplicate
   names within the file and against existing teams.
2. Invalid rows are listed with their line number and all problems, and are skipped.
3. All valid rows are sent in **one batch request**, which PocketBase executes in a single
   transaction. If the server rejects any row (e.g. a concurrent change), **nothing** is
   imported and the error is shown.

## Team documents (M1-13)

Files attached to a team, e.g. robot description, technical documentation or consent forms.

- **Upload and delete:** admins and the event's managers, while the event is not archived
  (team page, _Documents_ card). Each document has a title (required, ≤ 100 characters,
  prefilled from the file name) and one file of at most 20 MB: PDF, PNG, JPEG, WebP, GIF, plain
  text, ZIP or Office (Word, Excel, PowerPoint). The server sets `uploaded_by`; the team of a
  document cannot change.
- **Read:** all staff of the event (judges, head judges, managers), plus admins. Other users and
  other events' staff see neither the records nor the files.
- **Files are protected.** A download URL needs a short-lived file token
  (`pb.files.getToken()`); PocketBase then checks the collection's view rule, so a file is
  visible to exactly the users who can see its record. The web app refreshes the token while a
  page with documents is open.
- The event's Teams tab shows the number of documents per team. Deleting a team deletes its
  documents.
- Judges also see the documents during a guided robot check (M5-15, see
  [M5-judging.md](M5-judging.md)).

| Collection       | Fields                                                       | Migration                      |
| ---------------- | ------------------------------------------------------------ | ------------------------------ |
| `team_documents` | `team` (cascade), `title`, `file` (protected), `uploaded_by` | `1764000000_team_documents.js` |
