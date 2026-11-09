# Development guide

## Environments (M0-04)

| Environment | Frontend mode / env file            | Backend (`PB_ENV`)                        | Data directory             |
| ----------- | ----------------------------------- | ----------------------------------------- | -------------------------- |
| development | `vite --mode development`           | `development` → `127.0.0.1:8090`, `--dev` | `apps/backend/pb_data`     |
| test        | `vitest` / `vite build --mode test` | `test` → `127.0.0.1:8091`                 | temporary dir per test run |
| production  | `vite build` (`.env.production`)    | unset → `production` (Docker image)       | `/pb/pb_data` volume       |

Frontend variables live in `apps/web/.env*` and are typed in `apps/web/env.d.ts`. Put
machine-specific overrides in `apps/web/.env.<mode>.local` (git-ignored).

| Variable              | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `VITE_APP_NAME`       | Display name                                         |
| `VITE_APP_ENV`        | `development`, `test` or `production`                |
| `VITE_POCKETBASE_URL` | PocketBase base URL (`/` in production: same origin) |

The backend wrapper `apps/backend/scripts/pocketbase.mjs` accepts `PB_ENV`, `PB_DATA_DIR` and
`PB_HTTP`, and always points PocketBase at the repository's `migrations/` and `hooks/`.

## Backend

PocketBase is used as a prebuilt binary, pinned in `apps/backend/pocketbase.version`.
`pnpm setup:backend` downloads it and verifies the release checksum. To upgrade, change the
version file and run `pnpm setup:backend` (CI caches by that file's hash).

### Migrations (M0-07)

- JavaScript migrations live in `apps/backend/migrations/` and are applied automatically on
  `serve`, both to fresh and existing databases. Applied migrations are tracked in `_migrations`.
- Files are named `<unix-timestamp>_<description>.js` and must define both an up and a down
  function.
- In development (`--dev`), schema changes made in the admin dashboard are written as new
  migration files automatically. Review and commit them.
- Run manually: `pnpm --filter @judge26/backend migrate up` / `migrate down 1`.
- Every migration that adds collections or indexes needs an integration test (see
  `apps/backend/tests/foundation.test.ts`).

### Hooks

Server-side logic (custom routes, record hooks) lives in `apps/backend/hooks/*.pb.js`. Type
definitions for the JSVM are generated at `apps/backend/pb_data/types.d.ts` after the first start.

## Frontend

- Feature code goes into `apps/web/src/modules/<feature>/` (views, components, `api.ts`,
  `routes.ts`, `__tests__/`). Register module routes in `src/router/index.ts`.
- Cross-cutting code goes into `src/shared/` (API client, config, error handling, layout).
- UI primitives come from [shadcn-vue](https://www.shadcn-vue.com/) and are vendored into
  `src/components/ui/`. Add more with:

  ```sh
  cd apps/web && pnpm dlx shadcn-vue@latest add dialog
  ```

  Generated components may be adapted but are excluded from coverage.

### Error handling (M0-06)

- All API errors are converted with `toAppError()` (`src/shared/api/errors.ts`) into an
  `AppError` with a `kind` (`network`, `validation`, `unauthorized`, `forbidden`, `not_found`,
  `conflict`, `server`, `cancelled`, `unknown`), a user-facing `message` and `fieldErrors`.
- Components that handle an error locally use `toAppError()`; otherwise call `reportError()`
  to show a toast. Uncaught component errors and unhandled promise rejections are reported
  automatically (`installErrorHandling`).
- Server and network error details are never shown to users.

## Testing

| Layer       | Location                                   | Command                 |
| ----------- | ------------------------------------------ | ----------------------- |
| Unit        | `apps/web/src/**/__tests__/`, `packages/*` | `pnpm test`             |
| Integration | `apps/backend/tests/`                      | `pnpm test:integration` |
| E2E         | `e2e/`                                     | `pnpm test:e2e`         |

- Integration tests start an isolated PocketBase per suite via
  `startPocketBase()` (`apps/backend/tests/support/pocketbase.ts`) with a temporary data
  directory and a test superuser.
- E2E tests build the frontend in `test` mode, start PocketBase on port 8091 with a fresh
  database and run in desktop and tablet (768 × 1024) viewports.
- Name tests after roadmap IDs (e.g. `M0-T04: ...`) so they can be traced from the test plans in
  `docs/test-plans/`.

## Continuous integration (M0-05)

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

1. **checks** – format check, lint, type-check, unit tests with coverage, production build
2. **integration** – backend integration tests against the pinned PocketBase
3. **e2e** – Playwright tests (report uploaded on failure)
4. **docker** – production image build
