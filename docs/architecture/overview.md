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
- **Domain packages** (`packages/`, added from M2): scoring, ranking and scheduling engines as
  framework-independent TypeScript packages with their own unit and property-based tests. The
  roadmap requires these engines to operate independently of Vue and PocketBase.

## Frontend structure

```text
apps/web/src/
  components/ui/      shadcn-vue primitives (generated, vendored)
  lib/utils.ts        cn() helper used by shadcn-vue
  modules/<feature>/  feature modules: views/, components/, api.ts, routes.ts, __tests__/
  shared/             cross-cutting code: api/, config/, components/, errorHandling.ts
  router/             assembles module routes
```

Planned modules (from the roadmap): `events`, `teams`, `categories`, `scoring`, `rankings`,
`scheduling`, `judging`, `administration`. Currently only `system` exists (status page and
not-found route).

## Backend structure

```text
apps/backend/
  pocketbase.version  pinned PocketBase release
  migrations/         JS migrations (schema, indexes, API rules)
  hooks/              JS hooks and custom routes (*.pb.js)
  scripts/            install + run wrappers (environment-aware)
  tests/              integration tests against a real PocketBase instance
```

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
