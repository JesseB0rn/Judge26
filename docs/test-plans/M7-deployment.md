# Test plan: M7 – Reproducible deployment (M7-14)

- **Container** = `docker/smoke-test.sh` (CI job _docker_ and the release workflow), which runs
  `scripts/smoke-test.mjs` against the built image
- **Integration** = `apps/backend/tests/m7-security.test.ts` (_production configuration_: unknown API
  paths with the SPA served, dev routes, backups), `foundation.test.ts` (version info)
- **Unit** = `apps/web/src/modules/system/__tests__/BackendStatus.spec.ts` (version on the Status page)

| Check                                        | Covered by                          |
| -------------------------------------------- | ----------------------------------- |
| Image builds from pinned inputs              | CI _docker_, release workflow       |
| Fresh deployment starts healthy              | Container                           |
| Reports the expected version and commit      | Container, Integration, Unit        |
| SPA, assets and client-side routes served    | Container, Integration              |
| Unknown API paths are 404, dev routes absent | Container, Integration              |
| Restricted data needs an account             | Container (and M7-11)               |
| Migrations applied, backups scheduled        | Container                           |
| Runs unprivileged                            | Container                           |
| Data survives a container restart            | Container (and M7-T11)              |
| Upgrade from an image that ran as root       | Manual (see the M7 deployment spec) |

Not covered automatically: HTTPS with Caddy (needs a public DNS name); verify after the first
deployment with the smoke test against the `https://` URL.
