# M7 – Reproducible deployment

Refines roadmap task M7-14 ("Production deployment is reproducible"). Operations are in the
[deployment runbook](../operations/deployment.md).

## Same inputs, same image

| Input               | Pinned by                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Base images         | Tag **and digest** in the `Dockerfile` (Node build stage, Alpine runtime), Caddy in `docker-compose.caddy.yml` |
| JavaScript packages | `pnpm-lock.yaml`, installed with `--frozen-lockfile`; pnpm via `packageManager`                                |
| PocketBase          | `apps/backend/pocketbase.version`; the download is verified against the release checksums                      |
| Application code    | A git tag; the image reports `APP_VERSION` and `GIT_COMMIT` (`/api/app/info`, Status page, OCI labels)         |
| Configuration       | `.env` (template `.env.example`), applied on every start: SMTP, backups, superuser                             |

Updating a base image: `docker buildx imagetools inspect <image:tag>` and replace tag and digest
together. Updating PocketBase: change `pocketbase.version` (development, tests and the image use
the same file).

## Image

- Three stages: SPA and hook bundles (Node), PocketBase download (Alpine), runtime (Alpine with the
  binary, migrations, hooks and the SPA). The scheduling engine is a library for its own tests and
  is in neither the SPA nor the hooks, so it is not part of the image.
- Runs PocketBase as `judge26` (uid 10001); the entrypoint hands data from older (root) images
  over, then drops privileges (`su-exec`).
- Optional superuser bootstrap from `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD`.
- Settings secrets are encrypted with `PB_ENCRYPTION_KEY` (`--encryptionEnv`).
- Health check `GET /api/health`; logs rotated by Compose.
- Unknown `GET /api/...` paths answer `404` (JSON). Before, the SPA's index fallback answered them
  with `index.html` and `200`, e.g. for `/api/dev/mails` in production.

## Deployments

- `docker-compose.yml`: the app with its volume, configuration from `.env`.
- `docker-compose.caddy.yml`: adds Caddy with automatic HTTPS and HSTS in front of the app; the
  app is no longer published directly. Server-sent events are not buffered.
- Releases: a tag `vX.Y.Z` builds the image from that commit, smoke-tests it and publishes
  `ghcr.io/jesseb0rn/judge26:X.Y.Z` (and `X.Y`) for amd64 and arm64
  (`.github/workflows/release.yml`).

## Verification

- `scripts/smoke-test.mjs <url>`: checks a running deployment from outside (see the runbook).
- `docker/smoke-test.sh` (`pnpm test:docker`, CI job _docker_): builds the image, starts it like a
  fresh deployment with a new volume, checks that PocketBase runs unprivileged, runs the smoke test
  with the expected version and commit, and checks that data survives a container restart.
- Manually verified: a volume created by the previous (root) image starts with the new image, the
  data is handed over and the existing superuser signs in.
