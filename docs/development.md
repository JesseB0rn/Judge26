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

### Emails

PocketBase sends verification and password-reset emails. Configure SMTP with environment
variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_TLS`,
`MAIL_SENDER_ADDRESS`, `MAIL_SENDER_NAME`); `APP_URL` sets the frontend URL used in links
(defaults: `http://127.0.0.1:5173` in development, `http://127.0.0.1:4173` in test).

Without SMTP in development and test, emails are **not sent**. They are printed to the backend
console (`[dev mail] link: …`) and available at `GET /api/dev/mails?to=<email>`. Tests use
this to follow verification and reset links.

### Hooks and hot reload

In development PocketBase restarts automatically when a file in `hooks/` changes. This is
disabled in test and production (`--hooksWatch=false`) because a restart drops the server
mid-test. Handlers run in isolated JS contexts: module-level variables and functions are not
visible inside handlers, so shared code is `require`d inside each handler from `hooks/lib/`.

### Demo data

With the backend running (`pnpm dev`), `pnpm seed` creates demo accounts (password
`password123`), category templates and a published event with two days, categories, staff
and one team:

| Email                     | Role                            |
| ------------------------- | ------------------------------- |
| `admin@judge26.local`     | Administrator                   |
| `manager@judge26.local`   | Event manager of the demo event |
| `headjudge@judge26.local` | Head judge of the demo event    |
| `judge@judge26.local`     | Judge of the demo event         |
| `coach@judge26.local`     | Coach of "Robo Rangers"         |

The script is idempotent and also creates the superuser `superuser@judge26.local` /
`superuser-password` for the dashboard at http://127.0.0.1:8090/_/.

## Frontend

- Feature code goes into `apps/web/src/modules/<feature>/` (views, components, `api.ts`,
  `routes.ts`, `lib.ts` for pure logic, `__tests__/`). Register module routes in
  `src/router/index.ts`.
- Routes require a signed-in, verified user by default. Use route meta `public`,
  `guestOnly` or `requiresAdmin` (`src/router/guards.ts`). The session store
  (`src/shared/auth/session.ts`) exposes the user, their roles and helpers such as
  `canManageEvent(id)`. These checks are for UX only; the API enforces permissions.
- Use `useSubmit` / `useLoader` (`src/shared/composables/useSubmit.ts`) for API calls and
  `FormField` to show server-side field errors.
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

- Integration tests start an isolated PocketBase per test file via
  `startPocketBase()` (`apps/backend/tests/support/pocketbase.ts`) with a temporary data
  directory and a test superuser. `Fixtures` (`tests/support/fixtures.ts`) creates users with
  roles, events, categories and teams; `expectDenied` / `expectFieldError` assert API
  rejections.
- Component tests mount views with `mountView()` (`apps/web/src/test/utils.ts`), which sets up
  Pinia, a memory router and a pre-populated session; module `api.ts` files are mocked.
- E2E tests build the frontend in `test` mode, start PocketBase on port 8091 with a fresh
  database and a seeding superuser, and run in desktop and tablet (768 × 1024) viewports.
  `e2e/support/backend.ts` seeds users and events through the API.
- Name tests after roadmap IDs (e.g. `M0-T04: ...`) so they can be traced from the test plans in
  `docs/test-plans/`.

## Continuous integration (M0-05)

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

1. **checks** – format check, lint, type-check, unit tests with coverage, production build
2. **integration** – backend integration tests against the pinned PocketBase
3. **e2e** – Playwright tests (report uploaded on failure)
4. **docker** – production image build
