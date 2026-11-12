/// <reference path="../pb_data/types.d.ts" />

// M8-C: admins view the app as an event manager, head judge or judge of an event.
// See docs/specifications/M8-view-as.md and hooks/lib/view_as.js.
//
// - users.preview_of (hidden): marks the stand-in account of an admin. While an admin views the
//   app as a role, requests are made with that account, which holds only the chosen role, so
//   the API rules apply exactly as for a real holder of the role.
// - view_sessions: one per switch, written only by hooks/view_as.pb.js. The token is stored as a
//   SHA-256 hash, so ended sessions can be refused.
// - audit_log.view_as: the role an admin was viewing as when the entry was written.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(
      new RelationField({
        name: 'preview_of',
        collectionId: users.id,
        maxSelect: 1,
        hidden: true,
        cascadeDelete: true,
      }),
    )
    app.save(users)

    const events = app.findCollectionByNameOrId('events')
    const sessions = new Collection({
      type: 'base',
      name: 'view_sessions',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'admin',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        // The account the requests are made with: the admin's stand-in, or the chosen person.
        {
          type: 'relation',
          name: 'user',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'relation',
          name: 'event',
          required: true,
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'select',
          name: 'role',
          required: true,
          maxSelect: 1,
          values: ['event_manager', 'head_judge', 'judge'],
        },
        { type: 'bool', name: 'persona' },
        { type: 'text', name: 'token_hash', hidden: true, max: 64 },
        { type: 'date', name: 'expires_at' },
        { type: 'date', name: 'ended_at' },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX `idx_view_sessions_token` ON `view_sessions` (`token_hash`)',
        'CREATE INDEX `idx_view_sessions_admin` ON `view_sessions` (`admin`)',
        'CREATE INDEX `idx_view_sessions_user` ON `view_sessions` (`user`)',
      ],
    })
    app.save(sessions)

    const audit = app.findCollectionByNameOrId('audit_log')
    audit.fields.add(new TextField({ name: 'view_as', max: 300 }))
    app.save(audit)
  },
  (app) => {
    const audit = app.findCollectionByNameOrId('audit_log')
    audit.fields.removeByName('view_as')
    app.save(audit)

    app.delete(app.findCollectionByNameOrId('view_sessions'))

    const users = app.findCollectionByNameOrId('users')
    app
      .findRecordsByFilter('users', 'preview_of != ""', '', 0, 0)
      .forEach((record) => app.delete(record))
    users.fields.removeByName('preview_of')
    app.save(users)
  },
)
