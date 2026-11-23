# M11-B – Event workspace navigation

Refines roadmap requirements M11-15 – M11-21. Builds on M11-A (`M11-setup-flow.md`): once the
setup checklist links land on the work, the remaining friction is getting around the event
itself. This spec covers the event pages (`/events/{id}`, the planner, the print center, a
category's ranking and rules pages) and the main header.

## Why: the navigation review

We took screenshots of an admin's event at 1280 px, 768 px (tablet) and 390 px (phone) and
walked the pages that a setup or competition day touches.

| #   | Finding                                                                                                                                                                                                                                                                                    | Answered by    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| N1  | The event header mixes four actions (Edit, Publish, Save as template, Archive) with four places (Review scores, Print center, Planner, Live). That is eight outline buttons that look the same: two rows at 768 px, four at 390 px, before any content.                                    | M11-16         |
| N2  | Planner and Print center are places in the event, but opening one leaves the event: the tabs go, the event name becomes a subtitle, and each page has its own way back (planner: "← Event" button top right; print: breadcrumb top left; ranking: "Back to event" button without an icon). | M11-15, M11-18 |
| N3  | Scheduling is split across the Assignments tab (placing) and the Planner button (timing). The two halves of one checklist step (M11-06) look like different kinds of thing: one a tab, one a button.                                                                                       | M11-17         |
| N4  | The main navigation marks nothing on any event page: `/events/{id}` is not a child of `/events`, so "Events" is not active.                                                                                                                                                                | M11-19         |
| N5  | Six admin links share the header row with the work queues. At 768 px the row ends in "ADMIN E" with the rest scrolled away; on a phone the header takes two rows.                                                                                                                          | M11-20         |
| N6  | Nine tabs in one flat row with no grouping; on a phone the row is cut off ("Assig…") with no sign that it scrolls.                                                                                                                                                                         | M11-17         |
| N7  | Opening a draft event lands on Overview. The work on a draft is the Setup checklist, which is one more click away every time.                                                                                                                                                              | M11-21         |

Root cause behind N1 – N3: the event has no workspace. Its sections are tabs of one page, while
three of its places (planner, print center, category pages) are separate pages. The separate
pages had to be reached by buttons and left by Back links. The fix is one event frame, the same
header and navigation on every event page. A section can then be a tab or a route without the
user seeing a difference.

## The event frame (M11-15 – M11-18)

```
 Swiss Open 2026                                            [Draft] [Publish] [Edit] [⋯ More]
 Season 2026 · Bern
 Overview  Setup │ Categories  Teams  Staff │ Assignments  Planner  Print │ Public results  Messages  Activity    Review scores ↗  Live ↗
 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
 <section content: a tab of the event page, the planner, the print center or a category page>
```

- **One frame** (`EventFrame.vue`) renders the event header and the event navigation. Off
  the event page the event name links to it; the main navigation keeps Events current (M11-19),
  so no breadcrumb is needed. The event page, the planner, the print center and a category's ranking and rules
  pages all use it, and it is hidden when printing.
- **Header: actions only.** Publish (drafts, primary), Edit, and a **More** menu with Save as
  template and Archive or Restore. The publish confirmation (M11-13) works the same from every
  page of the frame.
- **Navigation: places only.** Links, not tabs: `aria-current="page"` on the current section, in
  four groups divided by a thin rule: _Overview, Setup_ · _Categories, Teams, Staff_ ·
  _Assignments, Planner, Print_ · _Public results, Messages, Activity_. Each item has the
  visibility it had before (M11-14 order kept; Planner and Print join where scheduling is).
  Planner reads "Schedule" for users who cannot edit it. Review scores and Live results end
  the row, marked ↗: they leave the event frame.
- **Category pages** show the frame with Categories current. Their own heading becomes a
  second-level title with the category name, and Back (M11-08) stays.
- **Section toolbars.** The planner's live indicator, Print and New block move into its toolbar
  row; the print center drops its own back link. Neither page has a separate page title any
  more: the current nav item says where the user is. This replaces the planner's Back button
  of M11-08: every place it led to is one click away in the navigation. Category pages keep
  Back when opened with `from`, and drop the "Back to event" fallback.
- **Narrow screens.** The navigation is one scrolling row with the current item scrolled into
  view. Header actions do not wrap: Edit and the More menu collapse to icons below 640 px.

## Main header (M11-19, M11-20)

- **Events stays current** on every page of the event frame and on team pages.
- **Admin menu.** Event templates, Categories, Users, Emails, Audit log, System health (and the
  dev mailbox) move into one **Admin** menu button. The header row then holds the work queues
  (Judging, Review), Events and Live results.

## Landing (M11-21)

An event manager opening a draft event without `?tab=` lands on Setup. Published and archived
events, and all other roles, still land on Overview. An explicit `?tab=` always wins.

## Implementation plan

| PR  | Requirements    | Changes                                                                                                                                                                                         |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | M11-15 – M11-18 | `EventFrame.vue`, `EventNav.vue` and `events/nav.ts` (sections, visibility, landing); `EventDetailView` sections as nav-driven panels; planner, print center, ranking and rules adopt the frame |
| 2   | M11-19, M11-20  | `AppShell.vue`: event-scoped active state, Admin menu                                                                                                                                           |
| 3   | M11-21          | `defaultTab` in `events/nav.ts`                                                                                                                                                                 |

## Out of scope

- Turning event tabs into separate routes. `?tab=` links stay valid; the nav hides the
  difference.
- A side bar layout. The header nav keeps the content full width for the board and planner.
- The judging pages: judges work from their own queue, not from the event frame.
