# Runbook: backup and restore

Applies to the Docker deployment (`docker compose up`); data lives in the `pb_data` volume
(`/pb/pb_data` in the container). See [M7 audit, backups and security](../specifications/M7-audit-backup-security.md).

## Automatic backups

Enabled by default in production: daily at 03:30 (server time), keeping the latest 14 in
`/pb/pb_data/backups`. Configure in `docker-compose.yml` / `.env`:

| Variable          | Default      | Meaning                          |
| ----------------- | ------------ | -------------------------------- |
| `BACKUP_CRON`     | `30 3 * * *` | Cron expression; `off` disables  |
| `BACKUP_MAX_KEEP` | `14`         | Number of automatic backups kept |

Backups on the same disk do not survive a disk failure: copy them elsewhere (see below) or
configure S3 storage in the dashboard (_Settings → Backups → S3_). During an event, take a
manual backup at the end of each competition day.

## Manual backup

Dashboard: `https://<host>/_/` → _Settings → Backups → New backup_, then download it.

Command line (any machine with Node.js and this repository):

```sh
export PB_URL=https://judge.example.org PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=…
pnpm --filter @judge26/backend backup create --download ./backups
pnpm --filter @judge26/backend backup list
```

Check a downloaded backup: `unzip -tq judge26_….zip` must report no errors, and the archive
contains `data.db`.

## Restore

Restoring **replaces all current data** (results entered since the backup are lost) and restarts
the server; clients reconnect automatically.

1. Take a backup of the current state first (it may be needed for comparison).
2. Dashboard: _Settings → Backups_ → the backup → _Restore_. Or:
   `pnpm --filter @judge26/backend backup restore <name> --yes`. To restore a file from elsewhere,
   upload it first: `backup upload ./judge26_….zip`.
3. Wait until `GET /api/health` answers again, sign in and check the latest results.
4. The audit log contains `backup.restore` with the backup's name.

### Offline restore (server does not start)

```sh
docker compose stop app
docker run --rm -v judge26_pb_data:/data -v "$PWD":/backup alpine \
  sh -c 'mkdir -p /data.old && mv /data/* /data.old/ 2>/dev/null; cd /data && unzip /backup/judge26_….zip'
docker compose start app
```

(The Compose project is named `judge26`, so the volume is `judge26_pb_data`; see `docker volume ls`.)

## Restart

The application keeps no state outside the database. After a crash or a planned restart
(`docker compose restart app`) all data is preserved, queued emails are sent, and public displays
reconnect by themselves.
