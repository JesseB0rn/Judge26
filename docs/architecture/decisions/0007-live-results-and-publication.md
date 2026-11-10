# ADR 0007: Live results and publication

- **Status:** accepted
- **Date:** 2026-11-10

## Context

M6 puts rankings, the schedule and progress on public pages and TV displays, updated while judges
score. The collections holding this data are restricted (teams contain coach contacts and members;
games and sheets contain scores), and their access rules are already expensive. Managers must decide
what becomes public, and a published ranking must not change silently.

## Decisions

1. **Purpose-built public endpoints** (`/api/public/...`) instead of opening collection rules. They
   return only what the public may see and compute the live ranking on the server with the same
   engine and inputs as snapshots.
2. **Publication on the category**: `public_live` (live, provisional ranking) and
   `published_snapshot` (the official ranking, an immutable M3 snapshot). Both off by default.
   Timestamps are set by hooks.
3. **A revision counter per event** (`live_revisions`) as the realtime signal. Hooks increase it after
   each committed change; clients subscribe to that single public record and reload, plus a light
   poll as a fallback. Realtime on the restricted collections would require public rules and would
   not tell displays about indirect changes (e.g. a sheet approval changing the ranking).
4. **TV mode is a separate bare layout**, not a hidden-controls variant of the app shell, so no
   administration control can appear on a display.

## Consequences

- One change reloads every connected display; acceptable for event-sized data, revisit with
  response caching keyed by revision if needed.
- Concurrent changes may merge into one revision step; the counter only signals "something changed",
  clients always fetch the full current state.
- Official rankings are only as current as the last published snapshot; managers republish to update.
