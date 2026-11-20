# M11-A – Categories grid and setup flow alignment

Refines roadmap requirements M11-01 – M11-14. Builds on the setup checklist (M8-20,
`docs/specifications/M8-event-setup.md`), the setup order (M9-10, M9-11) and rounds (M3-01).

## Why: the flow analysis

We mapped an admin setting up a first event twice: as **logical steps** (what the data must contain,
as `setupStatus` in `apps/backend/hooks/lib/templates.js` computes it) and as **UI steps** (the
pages, tabs, buttons and dialogs the admin goes through). Where the two differ is a finding.

| #   | Step                    | Finding                                                                                                                                                                                      | Answered by            |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| G1  | Create                  | The empty-event dialog has a Status field: an event can be created as published, so the last step is done before anything exists.                                                            | M11-10                 |
| G2  | Categories and rulesets | One step, two pages. Saving a category does not say it still needs a ruleset; a draft does not count, only Publish on a separate page does.                                                  | M11-03, M11-08         |
| G3  | Rounds                  | The checklist links to the Categories tab, where rounds are not. They are behind the **Ranking** button, then the Rounds tab of the category page.                                           | M11-01, M11-02, M11-06 |
| G4  | Schedule                | Two jobs on two screens (placing teams on the board, timing rounds in the planner); the step's Open link only reaches the board. A new round has a day but no start, so it is never "timed". | M11-05, M11-06         |
| G5  | Publish                 | "Needs schedule" is advice only: header, checklist and the edit dialog's Status all publish an incomplete event without a word.                                                              | M11-10, M11-13         |
| F1  | Create                  | The template dialog asks for a first day, the empty one does not, so days need a separate stop.                                                                                              | M11-11                 |
| F2  | Create                  | Two entry points to "new event from template" (Events list, Event templates page).                                                                                                           | M11-12                 |
| F3  | Rulesets                | Back on the ruleset page goes to the event's Overview tab, not where the admin came from.                                                                                                    | M11-08                 |
| F4  | Rounds                  | The round form needs a game (published ruleset) and a day, but the step lists only categories as a need.                                                                                     | M11-07                 |
| F5  | Tables                  | One place, three names: "Tables" (checklist), "Assignments" (tab), `?tab=schedule` (URL).                                                                                                    | M11-14                 |
| F6  | Tables                  | From a template, tables exist without judges; the step is open but does not say which tables.                                                                                                | M11-09                 |

An earlier version listed F7, a "Publication" tab next to the Publish button. It is withdrawn: the
tab reads "Public results" in all four languages; the name came from the message key
`events.tabs.publication`, not from the screen.

The root cause behind G2 and G3: a category is set up in three places. Its details are a row on the
Categories tab, its rulesets a page behind **Rules**, and its rounds a tab of a page behind
**Ranking**. The Categories tab shows one of the three, as a one-dimensional list. Rounds are the
second dimension of a category's setup, so the tab becomes a grid with categories down and rounds
across, and every row keeps its menu.

## The categories grid (M11-01 – M11-04)

### Layout

```
 Categories                                              [Add from template] [+ New category]
 ┌──────────────────────────────────────────┬──────────────┬──────────────┬──────────────┬─────────┐
 │ Category                                 │ Round 1      │ Round 2      │ Round 3      │         │
 ├──────────────────────────────────────────┼──────────────┼──────────────┼──────────────┼─────────┤
 │ RM-E  Elementary   2–3 · 8–12 · 16       │ R1 Practice  │ R2 Run 1     │ R3 Final     │ + Round │
 │ [Ranking] [Rules] [Edit] [⋯]             │ Main         │ Main         │ Main         │         │
 │                                          │ Sat 09:00    │ Sat 13:30    │ Sun 10:00    │         │
 ├──────────────────────────────────────────┼──────────────┼──────────────┼──────────────┼─────────┤
 │ RM-J  Junior       2–3 · 11–15 · ∞       │ R1 Run 1     │ R2 Final     │              │ + Round │
 │ [Ranking] [Rules ⚠ Draft only] [Edit] [⋯]│ Main ⚠       │ Main ⚠       │              │         │
 │                                          │ Sat –        │ Sun –        │              │         │
 ├──────────────────────────────────────────┼──────────────┼──────────────┼──────────────┼─────────┤
 │ RM-S  Senior       2–3 · 14–19 · ∞       │ + Round      │              │              │         │
 │ [Ranking] [Rules ⚠ No ruleset] [Edit] [⋯]│              │              │              │         │
 └──────────────────────────────────────────┴──────────────┴──────────────┴──────────────┴─────────┘
   ⚠ the game has no published ruleset   – no start time yet (not timed)
```

- **Rows**: one per category, in code order. The row header is the list row of today: code,
  name, team size, age, maximum teams, and the actions **Ranking**, **Rules**, **Edit**, and in
  the overflow **Save as template** (admins) and **Delete**. The row header stays in view while
  the rounds scroll sideways.
- **Columns**: round positions. Column _n_ holds each category's _n_-th round in position order;
  there are as many columns as the category with the most rounds has rounds. A category with fewer
  rounds leaves its remaining cells empty.
- **Round cell**: key and name, the game it plays (its name, only when the category has more than
  one game), its competition day and start time of the scoring run ("–" when not timed yet), and the
  robot check mode when it is not the default. A cell whose game has no published ruleset is
  marked, in form and text (never color alone).
- **Add round**: for event managers, the first empty cell of each row is **+ Round**.
- **Phone width** (< 768 px): one card per category: the row header, then its rounds as a list,
  then **+ Round**.
- **Who sees it**: everyone who can see the Categories tab. Rounds, game rules, rulesets and round
  phases are readable by everyone who can see the event (`listRule` of `rounds`, `game_rules`,
  `rulesets`, `round_phases`). Only event managers and admins see **+ Round** and can open the round
  form; for the others the grid is read-only.

### Editing rounds (M11-02, M11-05)

Choosing a round cell, or **+ Round**, opens the round form in a dialog on the Categories tab. It
has the fields of the Rounds tab (key, name, game, day, maintenance and scoring minutes, robot check
mode), plus the optional start time of M11-05, and **Save**, **Delete** and **Cancel**. The rules
are those of the Rounds tab (M3-01): the server refuses what it refuses there, with the same
messages. After a save the grid reloads that category's rounds.

The form is moved out of `RoundsPanel.vue` into `RoundForm.vue`, which the Rounds tab and the grid
dialog both use, so the two cannot drift apart.

**Start time** (M11-05): shown once a day is chosen. Saving the round, then
`round_phases.update(scoring, { starts_at, expected_updated })` places the round's scoring phase
in the planner, exactly as dropping it there would. The update sends the version it read, so a
concurrent planner edit gets the planner's 409; a time outside the day gets the planner's
validation error. In both cases the round is saved and the form stays open on it to fix the time.
Editing a round shows its current start.

### Ruleset state (M11-03)

Per category, the grid knows each game's state from the category's game rules and rulesets:
published, draft only, or none. The row's **Rules** action shows the worst state ("No published
ruleset", "Draft only") until every game has a published ruleset, and each round cell whose game
has none is marked. A category saved from **+ New category** appears with "No published ruleset" on
its Rules action straight away.

### Keyboard (M11-04)

The grid is an ARIA grid with one tab stop: arrow keys move between cells (row header actions
count as cells of column 0), Home and End jump to the ends of a row, Enter opens a round or adds
one. Each cell's accessible name reads category, position and round, for example "RM-J, round 2,
R2 Final, Sunday, not timed".

### Data

The grid loads in a fixed number of requests, whatever the number of categories:

| Records         | Request                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| Categories      | `categories` where `event = {id}` (as today)                            |
| Rounds          | `rounds` where `category.event = {id}`, sorted by category and position |
| Scoring phases  | `round_phases` where `round.category.event = {id} && phase = "scoring"` |
| Games, rulesets | `game_rules` and published `rulesets` where `category.event = {id}`     |
| Days            | `competition_days` of the event (as today)                              |

No new API route is needed.

## Setup checklist links (M11-06 – M11-09)

The checklist stays a list (`EventSetupChecklist.vue`).

- **Rounds** and **Categories and rulesets** open the Categories tab, which now shows both.
- **Schedule** shows "placed games" and "timed rounds" on separate lines, each with its own link:
  **Assignments** (the board and the generator) and **Planner**.
- **Needs** (M11-07): in `setupStatus`, `rounds.needs` becomes `['days', 'categories']`. When the
  event has no day, the round form says so and links to the Overview tab.
- **Way back** (M11-08): links into a category's pages and the planner carry
  `from=/events/{id}?tab=…`. `RulesetsView.vue`, `RankingView.vue` and `PlannerView.vue` read it
  with `backTarget()` (`shared/composables/useQueryRefs.ts`; `/events/` is already allowed). Without
  `from`, Back from a category's pages goes to the event's Categories tab.
- **Tables without judges** (M11-09): `setupStatus` adds `tables_without_judges_names` to the
  tables step; the checklist shows them.

## Create and publish (M11-10 – M11-13)

- **Status** (M11-10): the event dialog has no status field, for creating and editing. A
  create-request hook in `hooks/events.pb.js` defaults the status to `draft` and rejects another
  value from anyone but a superuser (`event_create_draft`).
- **First day** (M11-11): optional date, start and end (08:00–18:00) when creating an empty event,
  sent with the record API create as `first_day`. The hook validates the day before the event is
  saved and creates it right after; should that still fail, the event is deleted again. The record
  API keeps its audit logging.
- **One dialog** (M11-12): `NewEventDialog.vue` with a choice at the top for admins: empty event, or
  from a template (the fields of today's `NewEventFromTemplateDialog.vue`). The template library's
  **New event** opens it with the template chosen.
- **Publish confirmation** (M11-13): `PublishDialog.vue` loads the setup status; complete →
  publish at once; incomplete → list the open steps with **Go to setup** and **Publish anyway**.
  Used by the header button and the checklist's publish row. No `confirm()`.

## Naming and order (M11-14)

| Before               | After                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Tab value `schedule` | `assignments` (`?tab=schedule` and `/events/{id}/board` open it)                           |
| Setup step "Tables"  | "Tables and judges"                                                                        |
| Tab order            | Overview, Setup, Categories, Teams, Staff, Assignments, Public results, Messages, Activity |

Strings change in all four locales (`en`, `de`, `fr`, `it`).

## Implementation plan

Each phase is one or more pull requests that leave `main` releasable. Phase 1 needs no new view.

### Phase 1 – Fix the paths

| PR  | Requirements           | Changes                                                                                                                                          |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | M11-10, M11-11         | `EventFormDialog.vue` (drop Status, add first day); `hooks/lib/events.js` and the create hook in `hooks/events.pb.js`; backend tests             |
| 1b  | M11-07, M11-08, M11-09 | `rounds.needs` and table names in `lib/templates.js`; `from` in `RulesetsView.vue`, `RankingView.vue`, `PlannerView.vue`; Day hint in round form |
| 1c  | M11-13                 | `PublishDialog.vue`, used by the header and the checklist                                                                                        |
| 1d  | M11-14                 | Tab values, titles, order and redirects in `EventDetailView.vue` and `events/routes.ts`; locale strings                                          |

### Phase 2 – The categories grid

| PR  | Requirements   | Changes                                                                                                                                                                                                         |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a  | M11-02         | `RoundForm.vue` out of `RoundsPanel.vue`; the Rounds tab uses it unchanged                                                                                                                                      |
| 2b  | M11-01, M11-03 | `CategoryRoundsGrid.vue` (replaces `CategoryTable.vue` on the Categories tab; the library keeps `CategoryTable.vue`), loaders in `categories/api.ts`, grid layout logic in `categories/grid.ts` with unit tests |
| 2c  | M11-02, M11-04 | Round dialog from the grid; keyboard grid; card layout below 768 px                                                                                                                                             |
| 2d  | M11-06         | Checklist: Rounds and Categories steps to the Categories tab; Schedule split into placed and timed with two links                                                                                               |

### Phase 3 – Shortcuts

| PR  | Requirements | Changes                                                                                                    |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| 3a  | M11-05       | Start time in `RoundForm.vue`; `timeRound` in `rankings/api.ts` updates the scoring phase with its version |
| 3b  | M11-12       | `NewEventDialog.vue`; Events list and template library use it; `NewEventFromTemplateDialog.vue` folded in  |

### End-to-end

`e2e/events/setup-flow.spec.ts` covers the exit criteria: an empty event set up to published by
following the checklist, with every category's rounds added and timed on the Categories tab, every
link checked to land on its work and Back to return; and an event from a template where only teams,
judges, judges on tables and placement remain.

## Out of scope

- Locking steps: the M8-20 principle "steps are never locked" stays.
- Editing a ruleset's definition from the grid; the editor stays on its page.
- Placing teams from the grid; that stays on the assignment board.
- The category library (`/admin/categories`); it stays a list.
- Changing what a template contains (M8-21).
