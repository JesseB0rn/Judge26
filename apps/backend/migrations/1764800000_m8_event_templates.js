/// <reference path="../pb_data/types.d.ts" />

// M8-D: event template library (M8-21 – M8-24). A template is the setup of an event without
// people or results: days pattern, categories with game rules and rulesets, rounds, tables,
// planner columns and blocks. The file format lives in hooks/lib/templates.js; see
// docs/specifications/M8-event-setup.md.
//
// Templates are saved and uploaded through /api/event-templates (which validates the file), so
// the record API cannot create them; admins list, rename and delete them.

const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const notSent = (field) => `@request.body.${field}:isset = false`

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const admin = `${AUTH} && ${IS_ADMIN}`
    const templates = new Collection({
      type: 'base',
      name: 'event_templates',
      listRule: admin,
      viewRule: admin,
      createRule: null,
      // Only the name and description change; the content is replaced by uploading a new file.
      updateRule: `${admin} && ${notSent('data')} && ${notSent('format_version')} && ${notSent('origin')} && ${notSent('created_by')}`,
      deleteRule: admin,
      fields: [
        { type: 'text', name: 'name', required: true, max: 200 },
        { type: 'text', name: 'description', max: 2000 },
        // The template file (hooks/lib/templates.js), stored as uploaded or exported.
        { type: 'json', name: 'data', required: true, maxSize: 5000000 },
        { type: 'number', name: 'format_version', onlyInt: true, min: 1 },
        // Where it came from: the exported event's name, or "upload".
        { type: 'text', name: 'origin', max: 300 },
        { type: 'relation', name: 'created_by', collectionId: users.id, maxSelect: 1 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX `idx_event_templates_name` ON `event_templates` (`name`)'],
    })
    app.save(templates)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('event_templates'))
  },
)
