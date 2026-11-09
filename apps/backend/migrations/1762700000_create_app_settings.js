/// <reference path="../pb_data/types.d.ts" />

// M0-07: Initial schema. Key/value store for platform-wide settings.
// Only superusers can read or modify settings (all API rules are null).
migrate(
  (app) => {
    const collection = new Collection({
      type: 'base',
      name: 'app_settings',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: 'text', name: 'key', required: true, max: 100, pattern: '^[a-z0-9_.]+$' },
        { type: 'json', name: 'value', maxSize: 100000 },
        { type: 'text', name: 'description', max: 500 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_app_settings_key` ON `app_settings` (`key`)'],
    })
    app.save(collection)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('app_settings'))
  },
)
