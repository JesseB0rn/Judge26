/// <reference path="../pb_data/types.d.ts" />

// M3: rounds, games, ranking configuration and immutable ranking snapshots.
// See docs/specifications/M3-rounds-and-ranking.md.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const categories = app.findCollectionByNameOrId('categories')
    const teams = app.findCollectionByNameOrId('teams')
    const rulesets = app.findCollectionByNameOrId('rulesets')

    // Ranking configuration (validated by the ranking engine in hooks).
    categories.fields.add(new JSONField({ name: 'ranking', maxSize: 500000 }))
    app.save(categories)

    const rounds = new Collection({
      type: 'base',
      name: 'rounds',
      fields: [
        {
          type: 'relation',
          name: 'category',
          required: true,
          collectionId: categories.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        // Referenced by the ranking configuration, e.g. "R1".
        { type: 'text', name: 'key', required: true, max: 64, pattern: '^[A-Za-z][A-Za-z0-9_-]*$' },
        { type: 'text', name: 'name', required: true, max: 100 },
        { type: 'number', name: 'position', onlyInt: true, min: 0 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_rounds_category_key` ON `rounds` (`category`, `key`)'],
    })
    app.save(rounds)

    const games = new Collection({
      type: 'base',
      name: 'games',
      fields: [
        {
          type: 'relation',
          name: 'round',
          required: true,
          collectionId: rounds.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'relation',
          name: 'team',
          required: true,
          collectionId: teams.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'number', name: 'attempt', onlyInt: true, min: 0 },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['scheduled', 'completed', 'disqualified', 'absent'],
        },
        // Derived from `values` when `ruleset` is set (M3-03); otherwise entered directly.
        { type: 'number', name: 'points' },
        { type: 'number', name: 'time_ms', onlyInt: true, min: 0 },
        { type: 'relation', name: 'ruleset', collectionId: rulesets.id, maxSelect: 1 },
        { type: 'json', name: 'values', maxSize: 200000 },
        { type: 'text', name: 'notes', max: 2000 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_games_round_team_attempt` ON `games` (`round`, `team`, `attempt`)',
        'CREATE INDEX `idx_games_team` ON `games` (`team`)',
      ],
    })
    app.save(games)

    const snapshots = new Collection({
      type: 'base',
      name: 'ranking_snapshots',
      fields: [
        {
          type: 'relation',
          name: 'category',
          required: true,
          collectionId: categories.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'text', name: 'title', required: true, max: 200 },
        { type: 'json', name: 'config', maxSize: 500000 },
        { type: 'text', name: 'config_fingerprint', max: 32 },
        { type: 'json', name: 'inputs', maxSize: 10000000 },
        { type: 'json', name: 'result', maxSize: 10000000 },
        { type: 'text', name: 'fingerprint', max: 32 },
        { type: 'relation', name: 'created_by', collectionId: users.id, maxSelect: 1 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX `idx_ranking_snapshots_category` ON `ranking_snapshots` (`category`)',
      ],
    })
    app.save(snapshots)

    // --- Access rules ---
    const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
    const IS_ADMIN =
      '(@collection.role_assignments:adm.user ?= @request.auth.id && @collection.role_assignments:adm.role ?= "admin")'
    const anyRole = (e) =>
      `(@collection.role_assignments:any.user ?= @request.auth.id && @collection.role_assignments:any.event ?= ${e})`
    const isManager = (e) =>
      `(@collection.role_assignments:mgr.user ?= @request.auth.id && @collection.role_assignments:mgr.event ?= ${e} && @collection.role_assignments:mgr.role ?= "event_manager")`
    const hasOwnTeam = (e) =>
      `(@collection.teams:own.event ?= ${e} && @collection.teams:own.coach ?= @request.auth.id)`
    const templateManager =
      '(@collection.role_assignments:tpl.user ?= @request.auth.id && @collection.role_assignments:tpl.role ?= "event_manager")'

    // Rounds: visible like their category, managed like their category.
    {
      const E = 'category.event'
      const canSee = `(${anyRole(E)} || ${E}.status = "published" || (${E}.status = "archived" && ${hasOwnTeam(E)}))`
      rounds.listRule = `${AUTH} && (${IS_ADMIN} || (${E} = "" && ${templateManager}) || (${E} != "" && ${canSee}))`
      rounds.viewRule = rounds.listRule
      rounds.createRule = `${AUTH} && (${IS_ADMIN} || (${E} != "" && ${isManager(E)} && ${E}.status != "archived"))`
      rounds.updateRule = `${rounds.createRule} && (@request.body.category:isset = false || @request.body.category = category)`
      rounds.deleteRule = rounds.createRule
      app.save(rounds)
    }

    // Games: event staff and the team's coach can read; managers record results.
    {
      const E = 'round.category.event'
      games.listRule = `${AUTH} && (${IS_ADMIN} || ${anyRole(E)} || team.coach = @request.auth.id)`
      games.viewRule = games.listRule
      games.createRule = `${AUTH} && (${IS_ADMIN} || ${isManager(E)}) && ${E}.status != "archived"`
      games.updateRule = games.createRule
      games.deleteRule = games.createRule
      app.save(games)
    }

    // Snapshots: created only by the server route, never changed (M3-17).
    {
      const E = 'category.event'
      snapshots.listRule = `${AUTH} && (${IS_ADMIN} || ${anyRole(E)})`
      snapshots.viewRule = snapshots.listRule
      snapshots.createRule = null
      snapshots.updateRule = null
      snapshots.deleteRule = `${AUTH} && ${IS_ADMIN}`
      app.save(snapshots)
    }
  },
  (app) => {
    for (const name of ['ranking_snapshots', 'games', 'rounds']) {
      app.delete(app.findCollectionByNameOrId(name))
    }
    const categories = app.findCollectionByNameOrId('categories')
    categories.fields.removeByName('ranking')
    app.save(categories)
  },
)
