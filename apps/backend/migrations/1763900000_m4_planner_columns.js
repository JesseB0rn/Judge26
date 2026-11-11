/// <reference path="../pb_data/types.d.ts" />

// M4-14-33: custom planner columns next to the categories (e.g. visitors, coaches) that custom
// blocks can be placed in. See docs/specifications/M4-tables-and-scheduling.md.

// Same helpers as 1763700000_scoped_access_rules.js (migrations cannot share code).
const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const T = '@request.auth.teams_via_coach'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const anyRole = (e) => `(${MINE} && ${R}.event ?= ${e})`
const isManager = (e) => `(${MINE} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`
const hasOwnTeam = (e) => `(${T}.coach ?= @request.auth.id && ${T}.event ?= ${e})`
const canSeeEvent = (e, status) =>
  `(${anyRole(e)} || ${status} = "published" || (${status} = "archived" && ${hasOwnTeam(e)}))`
const unchanged = (field) =>
  `(@request.body.${field}:isset = false || @request.body.${field} = ${field})`

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    const manage = `${AUTH} && (${IS_ADMIN} || ${isManager('event')}) && event.status != "archived"`
    const list = `${AUTH} && (${IS_ADMIN} || ${anyRole('event')} || (public = true && ${canSeeEvent('event', 'event.status')}))`
    const columns = new Collection({
      type: 'base',
      name: 'schedule_columns',
      listRule: list,
      viewRule: list,
      createRule: manage,
      updateRule: `${manage} && ${unchanged('event')}`,
      deleteRule: manage,
      fields: [
        {
          type: 'relation',
          name: 'event',
          required: true,
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'text', name: 'name', required: true, max: 60 },
        // Order among the custom columns (they follow the categories).
        { type: 'number', name: 'position', onlyInt: true },
        // Public columns are shown to coaches and on public pages; others only to staff.
        { type: 'bool', name: 'public' },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_schedule_columns_event_name` ON `schedule_columns` (`event`, `name`)',
      ],
    })
    app.save(columns)

    // Custom columns a block covers, next to its categories. Both empty = all columns.
    const blocks = app.findCollectionByNameOrId('schedule_blocks')
    blocks.fields.add(
      new RelationField({ name: 'columns', collectionId: columns.id, maxSelect: 999 }),
    )
    app.save(blocks)
  },
  (app) => {
    const blocks = app.findCollectionByNameOrId('schedule_blocks')
    blocks.fields.removeByName('columns')
    app.save(blocks)
    app.delete(app.findCollectionByNameOrId('schedule_columns'))
  },
)
