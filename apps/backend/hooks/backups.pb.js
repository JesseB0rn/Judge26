/// <reference path="../pb_data/types.d.ts" />

// M7-09: automatic backups. PocketBase's backup system creates ZIP archives of pb_data (the
// SQLite databases and uploaded files) in pb_data/backups; superusers create, download, upload
// and restore them in the dashboard (Settings → Backups) or through /api/backups.
// See docs/operations/backup-and-restore.md.
//
//   BACKUP_CRON       cron expression of automatic backups ("off" disables them).
//                     Default in production: "30 3 * * *" (daily at 03:30) unless one is set.
//   BACKUP_MAX_KEEP   how many automatic backups to keep (default 14).

onBootstrap((e) => {
  e.next()
  const settings = e.app.settings()
  const cron = $os.getenv('BACKUP_CRON')
  const keep = parseInt($os.getenv('BACKUP_MAX_KEEP') || '14', 10)
  const production = ($os.getenv('PB_ENV') || 'production') === 'production'
  let target = settings.backups.cron
  if (cron !== '') target = cron === 'off' ? '' : cron
  else if (production && !target) target = '30 3 * * *'
  if (target !== settings.backups.cron || (target && settings.backups.cronMaxKeep !== keep)) {
    settings.backups.cron = target
    settings.backups.cronMaxKeep = keep
    e.app.save(settings)
  }
})
