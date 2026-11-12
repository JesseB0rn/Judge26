/// <reference path="../pb_data/types.d.ts" />

// M7-08: audit log of administrative changes made through the record API, and of backups
// (M7-09, M7-10). See hooks/lib/audit.js and docs/specifications/M7-audit-backup-security.md.
// The collection list must match AUDITED in hooks/lib/audit.js (handlers cannot share values).

onRecordCreateRequest(
  (e) => {
    e.next()
    require(`${__hooks}/lib/audit.js`).logRecordChange(e, 'create', null)
  },
  'events',
  'competition_days',
  'categories',
  'teams',
  'team_documents',
  'role_assignments',
  'game_rules',
  'rulesets',
  'rounds',
  'round_phases',
  'schedule_blocks',
  'schedule_columns',
  'tables',
  'games',
  'ranking_snapshots',
  'mail_templates',
  'event_templates',
)

onRecordUpdateRequest(
  (e) => {
    const before = e.record.original().clone()
    e.next()
    require(`${__hooks}/lib/audit.js`).logRecordChange(e, 'update', before)
  },
  'events',
  'competition_days',
  'categories',
  'teams',
  'team_documents',
  'role_assignments',
  'game_rules',
  'rulesets',
  'rounds',
  'round_phases',
  'schedule_blocks',
  'schedule_columns',
  'tables',
  'games',
  'ranking_snapshots',
  'mail_templates',
  'event_templates',
)

onRecordDeleteRequest(
  (e) => {
    const before = e.record.clone()
    e.next()
    require(`${__hooks}/lib/audit.js`).logRecordChange(e, 'delete', before)
  },
  'events',
  'competition_days',
  'categories',
  'teams',
  'team_documents',
  'role_assignments',
  'game_rules',
  'rulesets',
  'rounds',
  'round_phases',
  'schedule_blocks',
  'schedule_columns',
  'tables',
  'games',
  'ranking_snapshots',
  'mail_templates',
  'event_templates',
)

// Backups: created by a superuser (API/dashboard) or by the automatic schedule (M7-09).
onBackupCreate((e) => {
  e.next()
  require(`${__hooks}/lib/audit.js`).log(e.app, {
    auth: null,
    action: 'backup.create',
    summary: `Created backup “${e.name}”`,
    changes: { name: e.name },
  })
})

onBackupRestore((e) => {
  require(`${__hooks}/lib/audit.js`).markRestore(e.app, e.name)
  e.next()
})

onBootstrap((e) => {
  e.next()
  require(`${__hooks}/lib/audit.js`).logCompletedRestore(e.app)
})

// Who started a backup or restore through the API (the backup hooks do not know the user).
routerUse((e) => {
  const path = e.request.url.path
  if (e.request.method !== 'POST' || !path.startsWith('/api/backups')) return e.next()
  e.next()
  const audit = require(`${__hooks}/lib/audit.js`)
  const restore = /\/restore$/.test(path)
  const name = restore ? decodeURIComponent(path.split('/')[3] || '') : ''
  if (path === '/api/backups/upload') return
  audit.log(e.app, {
    auth: e.auth,
    action: restore ? 'backup.restore_requested' : 'backup.create_requested',
    summary: restore ? `Requested restore of backup “${name}”` : 'Requested a backup',
    changes: restore ? { name } : null,
    ip: audit.requestIp(e),
  })
})
