/// <reference path="../pb_data/types.d.ts" />

// M5: judge score sheets (draft → submitted → finalized), an append-only score audit and the
// competition day of a round. See docs/specifications/M5-judging.md.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const days = app.findCollectionByNameOrId('competition_days')
    const rounds = app.findCollectionByNameOrId('rounds')
    const games = app.findCollectionByNameOrId('games')
    const rulesets = app.findCollectionByNameOrId('rulesets')

    // Day on which a round is played (M5-02: judges filter their games by day).
    rounds.fields.add(new RelationField({ name: 'day', collectionId: days.id, maxSelect: 1 }))
    app.save(rounds)

    const sheets = new Collection({
      type: 'base',
      name: 'score_sheets',
      fields: [
        {
          type: 'relation',
          name: 'game',
          required: true,
          collectionId: games.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['draft', 'submitted', 'rejected', 'finalized'],
        },
        {
          type: 'select',
          name: 'outcome',
          required: true,
          maxSelect: 1,
          values: ['completed', 'disqualified', 'absent'],
        },
        // The ruleset version the sheet is scored with (pinned on the first save).
        { type: 'relation', name: 'ruleset', collectionId: rulesets.id, maxSelect: 1 },
        { type: 'json', name: 'values', maxSize: 200000 },
        { type: 'number', name: 'time_ms', onlyInt: true, min: 0 },
        // Computed by the server from the values; entered directly only without a ruleset.
        { type: 'number', name: 'points' },
        // Client timestamp (epoch ms) of the change; older offline drafts never overwrite newer ones.
        { type: 'number', name: 'client_saved_at', onlyInt: true, min: 0 },
        { type: 'relation', name: 'judge', collectionId: users.id, maxSelect: 1 },
        { type: 'date', name: 'submitted_at' },
        { type: 'relation', name: 'submitted_by', collectionId: users.id, maxSelect: 1 },
        { type: 'date', name: 'reviewed_at' },
        { type: 'relation', name: 'reviewed_by', collectionId: users.id, maxSelect: 1 },
        { type: 'text', name: 'review_note', max: 2000 },
        { type: 'number', name: 'corrections', onlyInt: true, min: 0 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_score_sheets_game` ON `score_sheets` (`game`)',
        'CREATE INDEX `idx_score_sheets_status` ON `score_sheets` (`status`)',
      ],
    })
    app.save(sheets)

    const audit = new Collection({
      type: 'base',
      name: 'score_audit',
      fields: [
        {
          type: 'relation',
          name: 'game',
          required: true,
          collectionId: games.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'select',
          name: 'action',
          required: true,
          maxSelect: 1,
          values: ['submitted', 'approved', 'rejected', 'corrected', 'manual_edit'],
        },
        { type: 'relation', name: 'actor', collectionId: users.id, maxSelect: 1 },
        { type: 'text', name: 'reason', max: 2000 },
        { type: 'json', name: 'before', maxSize: 200000 },
        { type: 'json', name: 'after', maxSize: 200000 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX `idx_score_audit_game` ON `score_audit` (`game`)'],
    })
    app.save(audit)

    // --- Access rules ---
    // Writes go through the judging routes only (hooks/judging.pb.js).
    const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
    const IS_ADMIN =
      '(@collection.role_assignments:adm.user ?= @request.auth.id && @collection.role_assignments:adm.role ?= "admin")'
    const E = 'game.team.event'
    const reviewer = `(@collection.role_assignments:rev.user ?= @request.auth.id && @collection.role_assignments:rev.event ?= ${E} && (@collection.role_assignments:rev.role ?= "head_judge" || @collection.role_assignments:rev.role ?= "event_manager"))`
    const tableJudge = 'game.table.judge = @request.auth.id'
    for (const collection of [sheets, audit]) {
      collection.listRule = `${AUTH} && (${IS_ADMIN} || ${reviewer} || ${tableJudge})`
      collection.viewRule = collection.listRule
      collection.createRule = null
      collection.updateRule = null
      collection.deleteRule = null
      app.save(collection)
    }
  },
  (app) => {
    for (const name of ['score_audit', 'score_sheets']) {
      app.delete(app.findCollectionByNameOrId(name))
    }
    const rounds = app.findCollectionByNameOrId('rounds')
    rounds.fields.removeByName('day')
    app.save(rounds)
  },
)
