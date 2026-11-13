# Judge26

Competition management platform for the World Robot Olympiad: events, categories, teams,
configurable scoring, rankings, scheduling, judging and live public results. See [ROADMAP.md](ROADMAP.md) for the
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
| `pnpm test:docker`      | Build the production image and smoke-test it (Docker)      |
| `pnpm smoke <url>`      | Smoke-test a running deployment                            |

Before the first E2E run, install the browser: `pnpm --filter @judge26/e2e install-browsers`.

## Repository layout

```text
apps/
  web/        Vue 3 SPA (feature modules in src/modules, shared code in src/shared)
  backend/    PocketBase configuration: migrations/, hooks/, integration tests
packages/     Framework-independent domain logic (scoring-engine, ranking-engine)
e2e/          Playwright end-to-end tests
docs/         Architecture, API notes, specifications and test plans
```

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Development guide](docs/development.md)
- [API conventions](docs/api/README.md)
- Specifications: [M1 permissions](docs/specifications/M1-permissions.md),
  [M1 team registration](docs/specifications/M1-teams.md),
  [M2 scoring rulesets](docs/specifications/M2-scoring-rulesets.md),
  [M3 rounds and ranking](docs/specifications/M3-rounds-and-ranking.md),
  [M4 tables and scheduling](docs/specifications/M4-tables-and-scheduling.md),
  [M5 judging](docs/specifications/M5-judging.md),
  [M6 live competition](docs/specifications/M6-live.md),
  [M7 communication](docs/specifications/M7-communication.md),
  [M7 exports](docs/specifications/M7-exports.md),
  [M7 audit, backups and security](docs/specifications/M7-audit-backup-security.md),
  [M7 deployment](docs/specifications/M7-deployment.md),
  [M7 monitoring](docs/specifications/M7-monitoring.md)
- Test plans: [M0 foundation](docs/test-plans/M0-foundation.md),
  [M1 identity and events](docs/test-plans/M1-identity-events.md),
  [M2 scoring engine](docs/test-plans/M2-scoring-engine.md),
  [M3 rounds and ranking](docs/test-plans/M3-rounds-and-ranking.md),
  [M4 tables and scheduling](docs/test-plans/M4-tables-and-scheduling.md),
  [M5 judging](docs/test-plans/M5-judging.md),
  [M6 live competition](docs/test-plans/M6-live.md),
  [M7 communication](docs/test-plans/M7-communication.md),
  [M7 exports](docs/test-plans/M7-exports.md),
  [M7 audit, backups and security](docs/test-plans/M7-audit-backup-security.md),
  [M7 deployment](docs/test-plans/M7-deployment.md),
  [M7 monitoring](docs/test-plans/M7-monitoring.md)
- Operations: [deployment](docs/operations/deployment.md),
  [backup and restore](docs/operations/backup-and-restore.md),
  [monitoring](docs/operations/monitoring.md)
- [Architecture decision records](docs/architecture/decisions/)

## Production

On a fresh Linux host (installs Docker if needed; asks for the domain, or pass `DOMAIN=…`):

```sh
curl -fsSL https://raw.githubusercontent.com/JesseB0rn/Judge26/main/scripts/install.sh | sudo sh
```

From a checkout:

```sh
cp .env.example .env    # configure
docker compose up -d --build                                            # HTTP on :8090
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d  # with HTTPS (Caddy)
pnpm smoke http://localhost:8090                                        # verify
```

A single image in which PocketBase serves the API and the built SPA, with data in the `pb_data`
volume. Tagged releases are published to `ghcr.io/jesseb0rn/judge26`. See the
[deployment runbook](docs/operations/deployment.md) and the
[backup and restore runbook](docs/operations/backup-and-restore.md); for alerts and uptime
monitoring, the [monitoring runbook](docs/operations/monitoring.md).

## License

Judge26 is source-available under the [Business Source License 1.1](LICENSE). You may read,
modify and redistribute the code, and run it in production for your own events, **except** the
World Robot Olympiad Association and WRO national or regional organizers (and anyone running it
for them), who need a separate paid commercial license. Each version converts to the
GNU AGPL v3.0 or later four years after its release. For commercial licensing, contact
Jesse Born <jesse.born@gmx.ch>.
