# Test plan: M0 – Project foundation

Traceability from roadmap tests to automated checks. CI job names refer to
`.github/workflows/ci.yml`.

| Test ID | Procedure                                | Automated by                                                              | CI job           |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------- | ---------------- |
| M0-T01  | Clone repository and install deps        | `pnpm install --frozen-lockfile`, `pnpm setup:backend`                    | all              |
| M0-T02  | Start frontend and backend               | `apps/backend/tests/foundation.test.ts` (health), `e2e/smoke/app.spec.ts` | integration, e2e |
| M0-T03  | Build production frontend                | `pnpm --filter @judge26/web build-only`; Docker image build               | checks, docker   |
| M0-T04  | Apply migrations to an empty database    | `foundation.test.ts` › "M0-T04: applies migrations…"                      | integration      |
| M0-T05  | Restart backend, data remains            | `foundation.test.ts` › "M0-T05 / M0-07: persistence across restarts"      | integration      |
| M0-T06  | Introduce a TypeScript error → CI fails  | `pnpm type-check` (vue-tsc / tsc, non-zero exit on error)                 | checks           |
| M0-T07  | Run unit test suite → CI reports results | `pnpm test:coverage` (Vitest; coverage artifact uploaded)                 | checks           |

## Acceptance criteria coverage

| ID    | Criterion                                    | Evidence                                                                                                        |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| M0-01 | Repo contains frontend, backend config, docs | `apps/web`, `apps/backend`, `docs/`                                                                             |
| M0-02 | Vue 3, TS, Vite, Tailwind compile            | M0-T03                                                                                                          |
| M0-03 | Backend starts reproducibly, data persists   | pinned + checksummed binary; M0-T02, M0-T05                                                                     |
| M0-04 | Separate dev/test/prod configuration         | `apps/web/.env.*`, `PB_ENV`; see [development guide](../development.md#environments-m0-04)                      |
| M0-05 | CI on every pull request                     | `.github/workflows/ci.yml` (`on: pull_request`)                                                                 |
| M0-06 | Consistent error handling                    | `errors.spec.ts`, `errorHandling.spec.ts`, `BackendStatus.spec.ts`, structured 403 test in `foundation.test.ts` |
| M0-07 | Migrations apply to fresh and existing DBs   | M0-T04, M0-T05                                                                                                  |

## Manual verification of M0-T06

M0-T06 requires demonstrating that CI fails on a type error. Open a throwaway PR adding e.g.
`const x: number = 'a'` to `apps/web/src/main.ts`, confirm the **checks** job fails at
`pnpm type-check`, then close the PR and link the run here as evidence.

## Status

| Test ID | Local result | CI evidence          |
| ------- | ------------ | -------------------- |
| M0-T01  | pass         | pending first CI run |
| M0-T02  | pass         | pending first CI run |
| M0-T03  | pass         | pending first CI run |
| M0-T04  | pass         | pending first CI run |
| M0-T05  | pass         | pending first CI run |
| M0-T06  | pass (local) | pending manual PR    |
| M0-T07  | pass         | pending first CI run |
