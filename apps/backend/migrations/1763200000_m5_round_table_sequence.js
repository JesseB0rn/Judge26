/// <reference path="../pb_data/types.d.ts" />

// M5: replace timed game placements with per-round phases and per-table team order.
migrate(
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.removeByName('min_rest_minutes')
    app.save(events)

    const rounds = app.findCollectionByNameOrId('rounds')
    rounds.fields.add(
      new NumberField({ name: 'testing_minutes', onlyInt: true, min: 0, max: 1440 }),
    )
    rounds.fields.add(
      new NumberField({ name: 'scoring_minutes', onlyInt: true, min: 1, max: 1440 }),
    )
    app.save(rounds)
    for (const round of app.findRecordsByFilter('rounds', '', 'position', 0, 0)) {
      round.set('testing_minutes', 0)
      round.set('scoring_minutes', round.getInt('duration_minutes') || 15)
      app.save(round)
    }
    const updatedRounds = app.findCollectionByNameOrId('rounds')
    updatedRounds.fields.removeByName('duration_minutes')
    app.save(updatedRounds)

    const tables = app.findCollectionByNameOrId('tables')
    tables.fields.add(
      new RelationField({
        name: 'judge',
        collectionId: app.findCollectionByNameOrId('users').id,
        maxSelect: 1,
      }),
    )
    app.save(tables)

    const games = app.findCollectionByNameOrId('games')
    games.fields.add(new NumberField({ name: 'sequence', onlyInt: true, min: 0 }))
    app.save(games)

    const gamesByTable = new Map()
    for (const game of app.findRecordsByFilter(
      'games',
      'table != ""',
      'round,table,starts_at,created',
      0,
      0,
    )) {
      const tableId = game.getString('table')
      const judges = game.getStringSlice('judges')
      if (!gamesByTable.has(tableId)) gamesByTable.set(tableId, { judges: new Set(), games: [] })
      const group = gamesByTable.get(tableId)
      judges.forEach((judge) => group.judges.add(judge))
      group.games.push(game)
    }
    for (const [tableId, group] of gamesByTable) {
      if (group.judges.size === 1) {
        const table = app.findRecordById('tables', tableId)
        table.set('judge', Array.from(group.judges)[0])
        app.save(table)
      }
      const byRound = new Map()
      for (const game of group.games) {
        const roundId = game.getString('round')
        byRound.set(roundId, (byRound.get(roundId) || 0) + 1)
        game.set('sequence', byRound.get(roundId))
        app.save(game)
      }
    }

    games.fields.removeByName('starts_at')
    games.fields.removeByName('locked')
    games.fields.removeByName('judges')
    games.indexes = games.indexes.filter((index) => !index.includes('idx_games_table'))
    games.indexes.push(
      'CREATE INDEX `idx_games_table` ON `games` (`table`)',
      'CREATE UNIQUE INDEX `idx_games_round_table_sequence` ON `games` (`round`, `table`, `sequence`) WHERE `table` != "" AND `sequence` > 0',
    )
    const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
    const IS_ADMIN =
      '(@collection.role_assignments:adm.user ?= @request.auth.id && @collection.role_assignments:adm.role ?= "admin")'
    const anyRole = (event) =>
      `(@collection.role_assignments:any.user ?= @request.auth.id && @collection.role_assignments:any.event ?= ${event})`
    const event = 'round.category.event'
    games.listRule = `${AUTH} && (team.coach = @request.auth.id || ${IS_ADMIN} || ${anyRole(event)})`
    games.viewRule = games.listRule
    app.save(games)

    app.delete(app.findCollectionByNameOrId('time_slots'))
    app.save(tables)
  },
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.add(
      new NumberField({ name: 'min_rest_minutes', onlyInt: true, min: 0, max: 1440 }),
    )
    app.save(events)

    const rounds = app.findCollectionByNameOrId('rounds')
    rounds.fields.add(
      new NumberField({ name: 'duration_minutes', onlyInt: true, min: 1, max: 1440 }),
    )
    for (const round of app.findRecordsByFilter('rounds', '', 'position', 0, 0)) {
      round.set(
        'duration_minutes',
        round.getInt('testing_minutes') + round.getInt('scoring_minutes'),
      )
      app.save(round)
    }
    rounds.fields.removeByName('testing_minutes')
    rounds.fields.removeByName('scoring_minutes')
    app.save(rounds)

    const users = app.findCollectionByNameOrId('users')
    const tables = app.findCollectionByNameOrId('tables')
    tables.fields.removeByName('judge')
    app.save(tables)

    const games = app.findCollectionByNameOrId('games')
    games.fields.add(new DateField({ name: 'starts_at' }))
    games.fields.add(new BoolField({ name: 'locked' }))
    games.fields.add(new RelationField({ name: 'judges', collectionId: users.id, maxSelect: 10 }))
    games.fields.removeByName('sequence')
    games.indexes = games.indexes.filter(
      (index) => !index.includes('idx_games_round_table_sequence'),
    )
    const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
    const IS_ADMIN =
      '(@collection.role_assignments:adm.user ?= @request.auth.id && @collection.role_assignments:adm.role ?= "admin")'
    const anyRole = (event) =>
      `(@collection.role_assignments:any.user ?= @request.auth.id && @collection.role_assignments:any.event ?= ${event})`
    const event = 'round.category.event'
    games.listRule = `${AUTH} && (${IS_ADMIN} || ${anyRole(event)} || team.coach = @request.auth.id)`
    games.viewRule = games.listRule
    app.save(games)

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
  },
)
