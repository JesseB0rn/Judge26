# ADR 0002: Identity, scoped roles and team registration model

- **Status:** accepted
- **Date:** 2026-11-09

## Context

M1 introduces users, roles, events, categories and team registration. Several roadmap
questions (§15) affect the model.

## Decisions

1. **Authentication with PocketBase's `users` auth collection**, email + password. Email
   verification is enforced in API rules (`@request.auth.verified = true`) rather than by
   blocking sign-in, so unverified users can sign in and resend the verification email.
2. **Scoped roles in a `role_assignments` collection** (`user`, `role`, `event`). `admin` is
   global; `event_manager`, `head_judge` and `judge` are scoped to one event. API rules read
   the user's own assignments through the auth record's back-relation
   (`@request.auth.role_assignments_via_user`), and team ownership through
   `@request.auth.teams_via_coach`. Conditions on the same back-relation are evaluated against
   the same row, and every check also compares `user`/`coach` with `@request.auth.id` so the
   empty row of a user without roles matches nothing (verified by `tests/access-rules.test.ts`).
   The first rules used unscoped `@collection.role_assignments:<alias>` joins, which multiplied
   with the size of the table (lists took 10–30 s with ~50 assignments); they were replaced in
   migration `1763700000_scoped_access_rules.js`.
3. **Coach is implicit**: ownership of a team registration, not a role. Coaches may register
   multiple teams (§15.2).
4. **Categories are copied per event** (`categories.event`; templates have no event). Copies
   are deep and record their `source`. This makes each event's configuration independent of
   later template changes, which is the foundation for ruleset versioning (§15.6, M2-14).
5. **Team members are stored as JSON** on the team. Members have no identity of their own in
   M1; revisit if members need accounts or cross-event history.
6. **Business rules are enforced on the server** (API rules + JS hooks) and mirrored in the
   frontend for feedback. The team rules exist in both `hooks/lib/teams.js` and
   `modules/teams/lib.ts`; both are covered by tests with the same scenarios.
7. **CSV import is parsed in the browser and committed with the batch API**, giving per-row
   error reports and an atomic commit without a custom server-side CSV parser.
8. **Emails**: PocketBase's verification and password-reset templates link to the frontend
   (`{APP_URL}/auth/...`). Without SMTP in development/test, emails are captured and exposed
   at `/api/dev/mails` (not registered in production).

## Consequences

- Permission logic is concentrated in one migration and is testable through the API.
- Rules are long strings; changes must be accompanied by integration tests.
- Duplicated validation (frontend/backend) must be kept in sync; a shared package could
  replace it if hooks gain a bundling step (see ADR 0001).
