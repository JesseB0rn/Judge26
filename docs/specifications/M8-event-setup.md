# M8-D – Event setup flow and templates

Refines roadmap requirements M8-19 – M8-24. Code: `apps/backend/hooks/lib/templates.js`,
`hooks/templates.pb.js`, migration `1764800000_m8_event_templates.js`, web module
`src/modules/templates/`.

## User stories (M8-19)

From the p1 user tests: testers did not know where to start after creating an event, did the steps
in an order the data did not allow (tables before categories, schedule before teams), and rebuilt
the same categories, rounds, tables and timetable for every regional event.

| As …          | I want to …                                                              | So that …                                                                      |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| admin         | create an event from last year's template with a new name and first day  | days, categories, rulesets, rounds, tables and the timetable are ready at once |
| admin         | create an empty event                                                    | I can set up a new format from scratch                                         |
| event manager | see one checklist of what my event still needs and jump to each step     | I know what to do next and when I am done                                      |
| event manager | do steps in any order once the data they build on exists                 | I can import teams while someone else sets up rounds                           |
| event manager | download my event's setup as a file                                      | an admin or another installation can reuse it                                  |
| admin         | save an event into the template library, upload files, rename and delete | the federation keeps a small set of maintained formats                         |
| admin         | be told exactly why a template file is refused                           | I can fix or ask for a correct file                                            |

The flow from creation to a published schedule:

1. **Create** the event (empty, or from a template: name, first day, optional season and venue).
   The new event opens on its **Setup** tab.
2. **Days** (overview tab) → **Categories and rulesets** → **Rounds** (categories tab).
3. **Tables** on the assignment board (Assignments tab).
4. **Teams** by CSV import (Teams tab), **Judges** by invitation (Staff tab) and onto tables (board).
5. **Schedule**: place every team on a table (board or generator) and time every round (planner).
6. **Publish** the event.

With a template, steps 2, 3 and the planner timing are already done; teams and judges remain.

## Setup checklist (M8-20)

The **Setup** tab (event managers and admins) lists the steps from `GET /api/events/{id}/setup`:

| Step         | Done when                                                              | Needs                       | Link                 |
| ------------ | ---------------------------------------------------------------------- | --------------------------- | -------------------- |
| `days`       | the event has a day                                                    | –                           | Overview             |
| `categories` | there is a category and each game rule of each has a published ruleset | –                           | Categories           |
| `rounds`     | every category has a round                                             | categories                  | Categories           |
| `tables`     | every category has an active table                                     | categories                  | Assignments          |
| `teams`      | there is an active team                                                | categories                  | Teams                |
| `judges`     | there is a judge or head judge and every active table has a judge      | –                           | Staff                |
| `schedule`   | every active team has a placed game for every round, every round timed | days, rounds, tables, teams | Assignments, Planner |
| `publish`    | the event is no longer a draft                                         | schedule                    | (the Publish button) |

Steps are never locked: one whose needs are not done shows “Needs … first”. Each step shows what is
missing (category codes without rulesets, rounds or tables; tables without judges; placed and
timed counts).

## Template file (M8-21, M8-22)

A versioned JSON file (`format: "judge26.event-template"`, `version: 1`); the full layout is
documented at the top of `hooks/lib/templates.js`.

| Contains                                                                         | Never contains                       |
| -------------------------------------------------------------------------------- | ------------------------------------ |
| Days as offsets from the first day, with labels and hours                        | Teams, members, contacts             |
| Categories with limits, judges per table, settings and ranking                   | Judges, staff roles, table judges    |
| Game rules, each with its **active ruleset copied** (definition, notes)          | Games, scores, ranking snapshots     |
| Rounds with game rule, durations and placed phases (maintenance, check, scoring) | Publication state, documents, emails |
| Tables (name, position, active, categories)                                      | Record ids                           |
| Planner custom columns and blocks                                                |                                      |

References are by value: days by offset, categories by code, game rules by key, columns by name,
so a file works on any installation. Open question 4 is settled: rulesets are **copied**, not
referenced by version, because version records do not exist on another installation. The new
event's rulesets start at version 1.

Uploads and stored templates are validated. Rejections carry a code and the place of the problem:

| Code                | When                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `template_not_json` | the file is not JSON                                                                                    |
| `template_format`   | the JSON is not an event template                                                                       |
| `template_too_new`  | `version` is newer than this installation reads (`{ version, supported }`)                              |
| `template_invalid`  | a value is missing, wrong or refers to something undefined (`{ path }`, e.g. `tables[0].categories[0]`) |

A ruleset definition that the scoring engine rejects is reported as `template_invalid` at the
ruleset's path when an event is created, and nothing is created.

## New event from a template (M8-23)

Asks for name and first day (season defaults to the first day's year, venue to the template's).
Every date moves so offset 0 falls on the first day. The event is created as a draft in one
transaction and is independent: it shares no records with the template or the source event.

## Library (M8-24)

Collection `event_templates` (name, description, data, format_version, origin, created_by).
Admins list, rename and delete templates through the record API; creating and replacing content
only happens through the routes below, which validate. The admin page **Event templates** lists
the templates with their contents and offers New event, Download, Edit and Delete; event
managers download their event's file from **Save as template** on the event page.

## API

| Method | Path                               | Who                    | Body / result                                       |
| ------ | ---------------------------------- | ---------------------- | --------------------------------------------------- |
| GET    | `/api/events/{id}/setup`           | event managers, admins | → `{ steps, complete }`                             |
| GET    | `/api/events/{id}/template`        | event managers, admins | → template file                                     |
| POST   | `/api/events/{id}/template`        | admins                 | `{ name, description? }` → library record           |
| POST   | `/api/event-templates`             | admins                 | `{ content, name?, description? }` → library record |
| POST   | `/api/event-templates/{id}/events` | admins                 | `{ name, first_day, season?, venue? }` → event      |

Saving, uploading and creating events are recorded in the audit log (`template.save`,
`template.create_event`); renames and deletions through the record API are logged like other
administrative changes.
