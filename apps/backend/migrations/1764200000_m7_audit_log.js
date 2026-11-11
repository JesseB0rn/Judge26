/// <reference path="../pb_data/types.d.ts" />

// M7-08: audit log of administrative actions (who changed what, when, from where).
// Written only by the server (hooks/audit.pb.js); admins read everything, event managers the
// entries of their events. See docs/specifications/M7-audit-backup-security.md.

const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const isManager = (e) => `(${MINE} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const read = `${AUTH} && (${IS_ADMIN} || (event != "" && ${isManager('event')}))`
    const log = new Collection({
      type: 'base',
      name: 'audit_log',
      listRule: read,
      viewRule: read,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        // Empty for superusers and the system; `actor_label` always says who it was.
        { type: 'relation', name: 'actor', collectionId: users.id, maxSelect: 1 },
        { type: 'text', name: 'actor_label', max: 300 },
        // create, update, delete, or a named action such as backup.create.
        { type: 'text', name: 'action', required: true, max: 50 },
        { type: 'text', name: 'collection', max: 100 },
        { type: 'text', name: 'record', max: 50 },
        // Event id as text: the entry outlives a deleted event.
        { type: 'text', name: 'event', max: 50 },
        { type: 'text', name: 'summary', max: 1000 },
        // { field: [before, after] } for updates, { field: value } for creates and deletes.
        { type: 'json', name: 'changes', maxSize: 100000 },
        { type: 'text', name: 'ip', max: 100 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX `idx_audit_log_created` ON `audit_log` (`created`)',
        'CREATE INDEX `idx_audit_log_event` ON `audit_log` (`event`, `created`)',
        'CREATE INDEX `idx_audit_log_record` ON `audit_log` (`collection`, `record`)',
      ],
    })
    app.save(log)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('audit_log'))
  },
)
