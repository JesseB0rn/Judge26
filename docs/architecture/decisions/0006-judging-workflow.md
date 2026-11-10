# ADR 0006: Score sheets and the judging workflow

- **Status:** accepted
- **Date:** 2026-11-10

## Context

M5 lets judges score games at the table, possibly offline, while finalized results must never
change without an authorized, audited correction (system invariant 1). The game (M3) already holds
the result the ranking uses, and managers can still enter results directly.

## Decisions

1. **A separate `score_sheets` collection** holds the judge's work in progress and the review
   state, one per game. The game only receives the result on approval. Unapproved scores therefore
   never reach the ranking, and the M3 result form and ranking code stay unchanged.
2. **Server routes own every transition.** Sheets and audit entries have no write API rules; the
   routes check roles, status and completeness in one place and run each transition in a
   transaction together with its audit entry.
3. **Append-only `score_audit`** records submissions, approvals, returns, corrections and direct
   result edits with before/after snapshots. Autosaved drafts are not audited: they are not scores
   yet and would flood the trail.
4. **Offline-first drafts on the device.** `localStorage` is the source of truth for unsynced
   changes; the server stores drafts with the device's change time and keeps the newest. Submitted
   and finalized sheets reject drafts with `409`, which the client uses to discard outdated local
   changes. No service worker in this milestone.
5. **Approval always required** for judge-entered scores; configurable approval can be added per
   category later without changing the data model.

## Consequences

- Results exist in two places (sheet and game) for finalized games; approval and correction keep
  them consistent in one transaction.
- Direct edits of a game whose sheet is submitted or finalized are refused, so managers use the
  correction flow for those.
- Device clocks decide which of two drafts is newer; acceptable for drafts, never used for
  submitted scores.
