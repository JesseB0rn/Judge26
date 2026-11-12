# Test plan: M1 – Identity, permissions and event management

Traceability from roadmap tests and acceptance criteria to automated tests.

- **Integration** = `apps/backend/tests/m1-*.test.ts` (real PocketBase, CI job _integration_)
- **Unit** = `apps/web/src/**/__tests__/*` (CI job _checks_)
- **E2E** = `e2e/**/*.spec.ts`, desktop and tablet (CI job _e2e_)

## Roadmap tests

| Test ID | Scenario                            | Integration                         | Unit / E2E                                                            |
| ------- | ----------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| M1-T01  | Register with valid credentials     | `m1-identity` › M1-T01              | E2E `account` › register, verify, sign in                             |
| M1-T02  | Register with an existing email     | `m1-identity` › M1-T02              | Unit `auth/views` › RegisterView field errors; E2E `account` › M1-T02 |
| M1-T03  | Log in with an invalid password     | `m1-identity` › M1-T03              | Unit `auth/views` › LoginView error; E2E `account` › M1-T03           |
| M1-T04  | Admin route as a judge              | `m1-permissions` › M1-T04           | Unit `guards`; E2E `permissions` › M1-T04                             |
| M1-T05  | Judge accesses another event        | `m1-permissions` › M1-T05           | E2E `permissions` › M1-T05                                            |
| M1-T06  | Event with two days                 | `m1-events` › M1-T06                | E2E `events/admin`                                                    |
| M1-T07  | Duplicate a category template       | `m1-categories` › M1-T07            | Unit `categories/views`; E2E `events/admin`                           |
| M1-T08  | Submit team registration            | Retired (M8-A)                      | –                                                                     |
| M1-T09  | Reject team registration            | Retired (M8-A)                      | –                                                                     |
| M1-T10  | Import CSV with invalid rows        | `m1-import` › M1-T10 (atomic batch) | Unit `teams/csv` (row reports), `teams/views` (dialog)                |
| M1-T11  | Coach accesses another coach's team | Retired (M8-A); see M8-T02          | –                                                                     |
| M1-T12  | Archive an event                    | `m1-events` › M1-T12                | Unit `events/views` › archives; E2E `events/admin`                    |

## Acceptance criteria

| ID    | Criterion                                                 | Evidence                                                                                 |
| ----- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| M1-01 | Register with email and password                          | M1-T01                                                                                   |
| M1-02 | Unverified accounts cannot access protected functionality | `m1-identity` › M1-02; `m1-permissions` › unverified admin; Unit `guards`; E2E `account` |
| M1-03 | Log in and log out                                        | `m1-identity` › M1-03; Unit `session`; E2E `account`                                     |
| M1-04 | Password reset by email                                   | `m1-identity` › M1-04; Unit `auth/views`; E2E `account` › M1-04                          |
| M1-05 | Multiple scoped roles                                     | `m1-permissions` › M1-05, role scoping, by-email; E2E `events/admin` (staff)             |
| M1-06 | Create, edit, archive events                              | `m1-events` › M1-06; Unit `events/views`; E2E `events/admin`                             |
| M1-07 | Multiple competition days                                 | `m1-events` › M1-T06, invalid/duplicate days; Unit `events/views`                        |
| M1-08 | Categories created and assigned to events                 | `m1-categories` › M1-08; Unit `categories/views`                                         |
| M1-09 | Copy category configurations                              | `m1-categories` › M1-T07, save as template, permissions                                  |
| M1-10 | Coaches create and submit registrations                   | Retired (M8-A): `m1-teams` › M8-02; E2E `workflow` › M8-01 / M8-02                       |
| M1-11 | Approve, reject and edit registrations                    | Replaced by active/withdrawn (M8-A): `m1-teams` › workflow, max teams; E2E `workflow`    |
| M1-12 | Import teams from CSV                                     | `m1-import`; Unit `teams/csv`, `teams/views`                                             |

## Exit criteria

- _Users with different roles can access only their authorized event resources_ —
  `m1-permissions`, `m1-teams` › M8-04, `access-rules`, `m1-events` › M1-T12, E2E `permissions`.
- _The complete registration-to-approval workflow works_ — superseded by M8-A: managers add
  and import active teams, E2E `registration/workflow.spec.ts`.

## Status

| Layer       | Result (local, 2026-11-09) | CI evidence    |
| ----------- | -------------------------- | -------------- |
| Integration | 56 passed                  | pending PR run |
| Unit        | 99 passed, 90% lines       | pending PR run |
| E2E         | 26 passed (×3 runs)        | pending PR run |
