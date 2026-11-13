# Runbook: deployment

Judge26 runs as **one container**: PocketBase serves the API, the dashboard (`/_/`) and the built
SPA on port 8090; all data is in the `pb_data` volume. See
[M7 deployment](../specifications/M7-deployment.md) for what makes a deployment reproducible.

## Requirements

- A Linux host with Docker Engine 24+ and the Compose plugin (1 vCPU / 1 GB RAM is plenty for an
  event; SQLite needs a local disk, not a network share).
- For HTTPS: a DNS name pointing at the host, ports 80 and 443 open.
- An SMTP account for emails (optional; without it emails stay queued and fail after retries).

## Installer

On a fresh Linux host (Debian, Ubuntu, …) one command installs Docker if needed, downloads the
compose files of the release, writes `.env` with generated secrets and starts the published image:

```sh
curl -fsSL https://raw.githubusercontent.com/JesseB0rn/Judge26/main/scripts/install.sh \
  | sudo DOMAIN=judge.example.org ACME_EMAIL=ops@example.org sh
```

- Without `DOMAIN` the app is served over plain HTTP on `JUDGE26_PORT` (8090); in a terminal the
  installer asks for the domain and the superuser email instead.
- Put the variables **after** `sudo` as above: `sudo` drops variables set before `curl`, and without
  a domain the installer uses plain HTTP. The mode follows `DOMAIN` in `/opt/judge26/.env` on
  every run (it prints `Mode: …`); to switch an existing installation to HTTPS, run the installer
  again with `DOMAIN=…` (or `DOMAIN=` back to HTTP).
- It installs into `/opt/judge26` (`JUDGE26_DIR`) and the latest release (`JUDGE26_VERSION=0.1.0`
  to pin one). `COMPOSE_FILE` in its `.env` selects the compose files, so `docker compose …` in
  that directory needs no `-f` options.
- The superuser password is printed once and kept in `.env`, like `PB_ENCRYPTION_KEY`.
- **Upgrade:** run the same command again (with `JUDGE26_VERSION` for a specific release). `.env`
  and the data are kept; the installer first creates a backup `pre-upgrade-….zip` in the app's
  backup list, then replaces the compose files and starts the new image.
- Further options (`INSTALL_DOCKER=0`, `NONINTERACTIVE=1`) are described at the top of
  `scripts/install.sh`.

The manual way, from a checkout:

## First deployment

```sh
git clone https://github.com/JesseB0rn/Judge26.git && cd Judge26
git checkout v0.1.0                     # always deploy a tag
cp .env.example .env                    # edit: APP_URL, superuser, PB_ENCRYPTION_KEY, SMTP, DOMAIN
export APP_VERSION=0.1.0 GIT_COMMIT=$(git rev-parse HEAD)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
pnpm smoke https://judge.example.org    # or: node scripts/smoke-test.mjs <url>
```

Instead of building, a released image can be used: set
`JUDGE26_IMAGE=ghcr.io/jesseb0rn/judge26:0.1.0` in `.env` and run `docker compose pull` before
`up -d` (without `--build`).

Without HTTPS (local network, behind an existing proxy): leave out `-f docker-compose.caddy.yml`;
the app listens on `JUDGE26_PORT` (8090). A proxy must not buffer server-sent events
(`/api/realtime`).

Then sign in to `https://<domain>/_/` with the superuser and check _Settings_ (mail settings are
applied from the environment on every start), sign in to the app with an account that has the
**admin** role (assign it in the dashboard: collection `role_assignments`, role `admin`, no event).

## Configuration

All settings come from `.env` (template: `.env.example`).

| Variable                                        | Purpose                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `APP_URL`                                       | Public URL, used in email links                                        |
| `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`   | Superuser created (or password reset) on every start                   |
| `PB_ENCRYPTION_KEY`                             | 32 characters; encrypts stored SMTP/S3 secrets. Set once, never change |
| `SMTP_*`, `MAIL_SENDER_*`                       | Email delivery (M7-01)                                                 |
| `SMTP_AUTH`, `SMTP_OAUTH_*`, `COMPOSE_PROFILES` | Email with OAuth for Microsoft 365 (M9-D, see below)                   |
| `JUDGE26_MAIL_RELAY_IMAGE`                      | Mail relay image (set by the installer)                                |
| `BACKUP_CRON`, `BACKUP_MAX_KEEP`                | Automatic backups ([runbook](backup-and-restore.md))                   |
| `MONITORING_*`                                  | Alert emails and thresholds ([monitoring runbook](monitoring.md))      |
| `DOMAIN`, `ACME_EMAIL`                          | HTTPS with Caddy                                                       |
| `JUDGE26_IMAGE`, `APP_VERSION`, `GIT_COMMIT`    | Image to run and the version it reports (`/api/app/info`, status page) |
| `JUDGE26_PORT`, `TZ`                            | Published port (without Caddy), time zone (backup schedule, logs)      |

### Email with OAuth (Microsoft 365)

Microsoft 365 is retiring password (basic) authentication for SMTP. PocketBase's SMTP client only
knows passwords, so with `SMTP_AUTH=oauth2` the app hands every email to the **mail relay**
(`mail-relay` service, image `ghcr.io/jesseb0rn/judge26-mail-relay`, source `apps/mail-relay`).
The relay is reachable only inside the compose network; it gets an access token with the OAuth
2.0 client credentials flow, renews it before it expires, and delivers to `smtp.office365.com:587`
with SMTP AUTH XOAUTH2. A message counts as sent only once Microsoft 365 accepted it, so token and
delivery errors show under _Emails_ and are retried like any mail-server error (M7-02).

1. **Register an app** in Microsoft Entra ID (App registrations → New registration). Note the
   _Directory (tenant) ID_ and _Application (client) ID_; create a **client secret**.
2. **API permissions** → Add → _APIs my organization uses_ → **Office 365 Exchange Online** →
   Application permissions → **`SMTP.SendAsApp`** → grant admin consent.
3. **Allow the app to send as the mailbox** (Exchange Online PowerShell, as an Exchange admin):

   ```powershell
   Connect-ExchangeOnline
   # The object ID of the app's *Enterprise application* (service principal), not the app registration.
   New-ServicePrincipal -AppId <client-id> -ObjectId <enterprise-app-object-id>
   Add-MailboxPermission -Identity judge26@example.org -User <enterprise-app-object-id> -AccessRights FullAccess
   Set-CASMailbox -Identity judge26@example.org -SmtpClientAuthenticationDisabled $false
   ```

4. **Configure** `.env` and leave `SMTP_HOST` … `SMTP_PASSWORD` empty:

   ```sh
   MAIL_SENDER_ADDRESS=judge26@example.org
   SMTP_AUTH=oauth2
   SMTP_OAUTH_TENANT_ID=<tenant-id>
   SMTP_OAUTH_CLIENT_ID=<client-id>
   SMTP_OAUTH_CLIENT_SECRET=<client-secret>
   # SMTP_OAUTH_USER=   mailbox to send as, when not MAIL_SENDER_ADDRESS
   ```

5. **Apply**: run the installer again (it sets `COMPOSE_PROFILES=mail-oauth` and pulls the relay),
   or set `COMPOSE_PROFILES=mail-oauth` yourself and run `docker compose up -d`.
6. **Check**: `docker compose logs mail-relay` shows `OAuth token obtained.`; send a test message
   (e.g. a judge invitation) and look under _Emails_.

The client secret expires (at most 24 months): renew it in Entra ID, update `.env` and
`docker compose up -d`. The relay never logs the secret or the token. To go back to a password,
set `SMTP_AUTH=basic` and the `SMTP_*` settings, then run the installer again.

## Verify a deployment

`node scripts/smoke-test.mjs <url>` checks health, the production build and its version
(`EXPECT_VERSION`, `EXPECT_COMMIT`), the SPA and its assets, client-side routes, caching and
security headers, that development endpoints are absent and restricted data needs an account. With
`PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` it also checks the migrations and the backup
schedule. The version is also shown on the app's **Status** page.

## Upgrade

1. Not during a competition day. Announce a few minutes of downtime.
2. Take a backup and download it:
   `pnpm --filter @judge26/backend backup create --download ./backups` (see the backup runbook).
3. `git fetch --tags && git checkout v1.3.0`, set `APP_VERSION` / `GIT_COMMIT` (or
   `JUDGE26_IMAGE`) to the new version.
4. `docker compose … up -d --build` (or `pull` + `up -d`). Migrations run on start.
5. `EXPECT_VERSION=1.3.0 pnpm smoke <url>`, then sign in and open an event.

## Rollback

- **New version does not start / smoke test fails:** check `docker compose logs app`. Go back to
  the previous tag (or `JUDGE26_IMAGE`) and `up -d` again.
- **Migrations of the new version already ran:** an older version may not understand the newer
  schema. Roll back the code **and** restore the backup from step 2 (backup runbook → _Restore_);
  data entered since the upgrade is lost, so roll back only right after an upgrade.

## Operations

| Task    | Command                                                      |
| ------- | ------------------------------------------------------------ |
| Logs    | `docker compose logs -f app` (rotated, 5×10 MB)              |
| Restart | `docker compose restart app`                                 |
| Status  | `docker compose ps` (health), `pnpm smoke <url>`             |
| Health  | _Admin → System health_, [monitoring runbook](monitoring.md) |
| Shell   | `docker compose exec app sh`                                 |
| Backups | [backup and restore runbook](backup-and-restore.md)          |

The container runs PocketBase as the unprivileged user `judge26` (uid 10001). On start, data
created by older images (which ran as root) is handed over to that user automatically.
