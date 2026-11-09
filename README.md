# Judge26

Competition management platform for the World Robot Olympiad: events, categories, teams,
configurable scoring, rankings, scheduling and judging. See [ROADMAP.md](ROADMAP.md) for the
full requirements and milestones.

**Stack:** Vue 3 · TypeScript · Vite · Tailwind CSS · shadcn-vue · PocketBase · Vitest · Playwright

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 10 (`corepack enable` picks up the pinned version)
- `unzip` (used to install PocketBase)
- Docker (optional, for production-like runs)

## Quick start

```sh
pnpm install          # install all workspace dependencies
pnpm setup:backend    # download the pinned PocketBase binary into apps/backend/bin
pnpm dev              # start backend (:8090) and frontend (:5173)
pnpm seed             # (other terminal) demo accounts and data, password "password123"
```

- Frontend: http://127.0.0.1:5173
- PocketBase API: http://127.0.0.1:8090/api/
- PocketBase admin dashboard: http://127.0.0.1:8090/\_/

If port 8090 is taken, run the backend elsewhere with `PB_HTTP=127.0.0.1:8092 pnpm dev` and set
`VITE_POCKETBASE_URL=http://127.0.0.1:8092` in `apps/web/.env.development.local`.

On first start, PocketBase prints a link to create the initial superuser. Alternatively:

```sh
pnpm --filter @judge26/backend superuser upsert admin@example.com <password>
```

## Common scripts

| Command                 | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `pnpm dev`              | Run backend and frontend in development mode               |
| `pnpm build`            | Type-check and build the frontend for production           |
| `pnpm lint`             | Run oxlint and ESLint                                      |
| `pnpm type-check`       | Type-check all workspace packages                          |
| `pnpm format`           | Format the repository with Prettier                        |
| `pnpm test`             | Unit tests (Vitest)                                        |
| `pnpm test:coverage`    | Unit tests with coverage (thresholds enforced)             |
| `pnpm test:integration` | Backend integration tests against a real PocketBase        |
| `pnpm test:e2e`         | End-to-end tests (Playwright; builds and starts both apps) |
| `pnpm test:all`         | All of the above test layers                               |

Before the first E2E run, install the browser: `pnpm --filter @judge26/e2e install-browsers`.

## Repository layout

```text
apps/
  web/        Vue 3 SPA (feature modules in src/modules, shared code in src/shared)
  backend/    PocketBase configuration: migrations/, hooks/, integration tests
packages/     Framework-independent domain logic (scoring-engine; ranking, scheduling to come)
e2e/          Playwright end-to-end tests
docs/         Architecture, API notes, specifications and test plans
```

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Development guide](docs/development.md)
- [API conventions](docs/api/README.md)
- Specifications: [M1 permissions](docs/specifications/M1-permissions.md),
  [M1 team registration](docs/specifications/M1-teams.md),
  [M2 scoring rulesets](docs/specifications/M2-scoring-rulesets.md)
- Test plans: [M0 foundation](docs/test-plans/M0-foundation.md),
  [M1 identity and events](docs/test-plans/M1-identity-events.md),
  [M2 scoring engine](docs/test-plans/M2-scoring-engine.md)
- [Architecture decision records](docs/architecture/decisions/)

## Production

```sh
docker compose up --build
```

Builds a single image in which PocketBase serves both the API and the built SPA on port 8090,
with data persisted in the `pb_data` volume. See the [architecture overview](docs/architecture/overview.md#deployment).
