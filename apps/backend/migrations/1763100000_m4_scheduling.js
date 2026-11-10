/// <reference path="../pb_data/types.d.ts" />

// M4: tables, time slots (availability and breaks) and game placement.
// See docs/specifications/M4-tables-and-scheduling.md.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const events = app.findCollectionByNameOrId('events')
    const categories = app.findCollectionByNameOrId('categories')
    const rounds = app.findCollectionByNameOrId('rounds')
    const games = app.findCollectionByNameOrId('games')

    // Scheduling settings: minimum rest between games of one team, and game length per round.
    events.fields.add(
      new NumberField({ name: 'min_rest_minutes', onlyInt: true, min: 0, max: 1440 }),
    )
    app.save(events)
    rounds.fields.add(
      new NumberField({ name: 'duration_minutes', onlyInt: true, min: 1, max: 1440 }),
    )
    app.save(rounds)

    const tables = new Collection({
      type: 'base',
      name: 'tables',
      fields: [
        {
          type: 'relation',
          name: 'event',
          required: true,
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'text', name: 'name', required: true, max: 100 },
        { type: 'number', name: 'position', onlyInt: true, min: 0 },
        { type: 'bool', name: 'active' },
        // Empty = the table accepts every category of the event (M4-02).
        { type: 'relation', name: 'categories', collectionId: categories.id, maxSelect: 100 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_tables_event_name` ON `tables` (`event`, `name`)'],
    })
    app.save(tables)

    const slots = new Collection({
      type: 'base',
      name: 'time_slots',
      fields: [
        {
          type: 'relation',
          name: 'event',
          required: true,
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'select', name: 'kind', required: true, maxSelect: 1, values: ['play', 'break'] },
        { type: 'text', name: 'label', max: 100 },
        { type: 'date', name: 'starts_at', required: true },
        { type: 'date', name: 'ends_at', required: true },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX `idx_time_slots_event` ON `time_slots` (`event`)'],
    })
    app.save(slots)

    // Placement of a game: table, start time (absolute, so multi-day works), lock, judges (M4-05, M4-09, M4-12).
    games.fields.add(new RelationField({ name: 'table', collectionId: tables.id, maxSelect: 1 }))
    games.fields.add(new DateField({ name: 'starts_at' }))
    games.fields.add(new BoolField({ name: 'locked' }))
    games.fields.add(new RelationField({ name: 'judges', collectionId: users.id, maxSelect: 10 }))
    games.indexes.push('CREATE INDEX `idx_games_table` ON `games` (`table`)')
    app.save(games)

    // --- Access rules (same pattern as rounds: visible like the event, managed by its managers) ---
    const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
    const IS_ADMIN =
      '(@collection.role_assignments:adm.user ?= @request.auth.id && @collection.role_assignments:adm.role ?= "admin")'
    const anyRole = (e) =>
      `(@collection.role_assignments:any.user ?= @request.auth.id && @collection.role_assignments:any.event ?= ${e})`
    const isManager = (e) =>
      `(@collection.role_assignments:mgr.user ?= @request.auth.id && @collection.role_assignments:mgr.event ?= ${e} && @collection.role_assignments:mgr.role ?= "event_manager")`
    const hasOwnTeam = (e) =>
      `(@collection.teams:own.event ?= ${e} && @collection.teams:own.coach ?= @request.auth.id)`

    for (const collection of [tables, slots]) {
      const E = 'event'
      const canSee = `(${anyRole(E)} || ${E}.status = "published" || (${E}.status = "archived" && ${hasOwnTeam(E)}))`
      collection.listRule = `${AUTH} && (${IS_ADMIN} || (${E} != "" && ${canSee}))`
      collection.viewRule = collection.listRule
      collection.createRule = `${AUTH} && (${IS_ADMIN} || (${E} != "" && ${isManager(E)} && ${E}.status != "archived"))`
      collection.updateRule = `${collection.createRule} && (@request.body.event:isset = false || @request.body.event = event)`
      collection.deleteRule = collection.createRule
      app.save(collection)
    }
  },
  (app) => {
    const games = app.findCollectionByNameOrId('games')
    for (const name of ['table', 'starts_at', 'locked', 'judges']) games.fields.removeByName(name)
    games.indexes = games.indexes.filter((i) => !i.includes('idx_games_table'))
    app.save(games)

    for (const name of ['time_slots', 'tables']) app.delete(app.findCollectionByNameOrId(name))

    const rounds = app.findCollectionByNameOrId('rounds')
    rounds.fields.removeByName('duration_minutes')
    app.save(rounds)

    const events = app.findCollectionByNameOrId('events')
    events.fields.removeByName('min_rest_minutes')
    app.save(events)
  },
)
