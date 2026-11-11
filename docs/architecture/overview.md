# Architecture overview

## Components

```text
┌────────────────────────┐        HTTPS / JSON, realtime (SSE)       ┌──────────────────────────┐
│ Vue 3 SPA (apps/web)    │ ────────────────────────────────────────▶ │ PocketBase (apps/backend) │
│ shadcn-vue, Tailwind    │                                           │ SQLite, auth, API rules   │
│ Pinia, Vue Router       │ ◀──────────────────────────────────────── │ JS migrations and hooks   │
└───────────┬────────────┘                                           └──────────────────────────┘
            │ imports
            ▼
┌────────────────────────────────────────────┐
│ packages/* – pure TypeScript domain logic    │
│ scoring, ranking and scheduling engines      │
│ (no dependency on Vue or PocketBase)         │
└────────────────────────────────────────────┘
```

- **Frontend** (`apps/web`): single-page application. Talks to PocketBase through the official
  JS SDK (`src/shared/api/pocketbase.ts`).
- **Backend** (`apps/backend`): PocketBase as a prebuilt, version-pinned binary. The schema is
  defined by JavaScript migrations, server-side behaviour by JS hooks. Authorization is enforced
  with PocketBase API rules; the frontend never relies on hiding UI for security.
- **Domain packages** (`packages/`): framework-independent TypeScript with their own unit and
  property-based tests. `packages/scoring-engine` (M2) validates and evaluates scoring
  rulesets; `packages/ranking-engine` (M3) aggregates round results and ranks teams. Both are
  used directly by the frontend and bundled into the PocketBase hooks (`hooks/lib/*-engine.js`,
  generated). The scheduling engine follows in M4.

## Frontend structure

```text
apps/web/src/
  components/ui/      shadcn-vue primitives (generated, vendored)
  lib/utils.ts        cn() helper used by shadcn-vue
  modules/<feature>/  feature modules: views/, components/, api.ts, routes.ts, __tests__/
  shared/             cross-cutting code: api/, config/, components/, errorHandling.ts
  router/             assembles module routes
```

Modules: `auth` (sign-in, registration, verification, password reset), `events` (events
and competition days), `categories` (event categories and the template library), `teams`
(registration, review, CSV import), `administration` (users and event staff) and `system`
(dashboard, status, error pages) and `scoring` (versioned rulesets, JSON editor, generated
score sheet preview) and `rankings` (rounds, results, ranking configuration, live ranking,
snapshots), `scheduling` (tables and per-table game order) and `judging` (judge dashboard, score
sheets with stopwatch and offline drafts, review and corrections; see
[M5 judging](../specifications/M5-judging.md)) and `live` (public results, schedule, progress and TV
mode; result publication; see [M6 live competition](../specifications/M6-live.md)) and
`communication` (email templates, delivery log, schedule notifications; see
[M7 communication](../specifications/M7-communication.md)).

Permissions are specified in [M1 permissions](../specifications/M1-permissions.md).

## Backend structure

```text
apps/backend/
  pocketbase.version  pinned PocketBase release
  migrations/         JS migrations (schema, indexes, API rules)
  hooks/              JS hooks and custom routes (*.pb.js); shared code in hooks/lib/
  scripts/            install + run wrappers (environment-aware)
  tests/              integration tests against a real PocketBase instance
```

## Live updates

Public displays and staff ranking pages subscribe (PocketBase realtime, server-sent events) to the
event's `live_revisions` record, which hooks increase after every committed change, and reload
through the public endpoints. A light poll of the same record covers missed messages. See
[ADR 0007](decisions/0007-live-results-and-publication.md).

## Email

Notifications are queued in an outbox in the same transaction as the change that caused them and
delivered right after commit or by a job every minute, with retries. See
[ADR 0008](decisions/0008-transactional-email-outbox.md).

## Error model

PocketBase returns errors as `{ status, message, data }` where `data` holds field-level
validation errors. The frontend normalizes every failure into an `AppError`
(see [development guide](../development.md#error-handling-m0-06)).

## Deployment

The root `Dockerfile` builds a single image:

1. builds the SPA with `.env.production` (`VITE_POCKETBASE_URL=/`),
2. downloads the pinned PocketBase release and verifies its checksum,
3. runs PocketBase with `--publicDir` pointing at the built SPA, so API and frontend share one
   origin. PocketBase's index fallback serves `index.html` for client-side routes.

Data lives in `/pb/pb_data` (a volume in `docker-compose.yml`). Migrations are applied on start.
Backups, monitoring and TLS termination are addressed in M7.

## Decisions

See [decisions/](decisions/) for architecture decision records.
