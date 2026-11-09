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

M0-T06 was verified with throwaway PR [#2](https://github.com/JesseB0rn/Judge26/pull/2), which
added `export const m0t06: number = 'not a number'` to `apps/web/src/main.ts`. The **checks** job
failed at `pnpm type-check` ([run 42661830190](https://github.com/JesseB0rn/Judge26/actions/runs/42661830190)); the PR was closed without merging.

Note: the **docker** job does not type-check (it runs `vite build` only) and passed on that PR.
The **checks** job is the gate for type errors.

To repeat: open a draft PR with a deliberate type error, confirm **checks** fails at
`pnpm type-check`, close the PR and link the run here.

## Status

Evidence recorded on 2026-11-09 from PR [#1](https://github.com/JesseB0rn/Judge26/pull/1).

| Test ID | Result | CI evidence                                                                                                           |
| ------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| M0-T01  | pass   | [run 42661508012](https://github.com/JesseB0rn/Judge26/actions/runs/42661508012) (all jobs: `pnpm install`)           |
| M0-T02  | pass   | [run 42661508012](https://github.com/JesseB0rn/Judge26/actions/runs/42661508012) (integration, e2e)                   |
| M0-T03  | pass   | [run 42661508012](https://github.com/JesseB0rn/Judge26/actions/runs/42661508012) (checks: build-only; docker)         |
| M0-T04  | pass   | [run 42661508012](https://github.com/JesseB0rn/Judge26/actions/runs/42661508012) (integration)                        |
| M0-T05  | pass   | [run 42661508012](https://github.com/JesseB0rn/Judge26/actions/runs/42661508012) (integration)                        |
| M0-T06  | pass   | [run 42661830190](https://github.com/JesseB0rn/Judge26/actions/runs/42661830190) (checks failed at `pnpm type-check`) |
| M0-T07  | pass   | [run 42661508012](https://github.com/JesseB0rn/Judge26/actions/runs/42661508012) (checks: `pnpm test:coverage`)       |
