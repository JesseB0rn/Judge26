/// <reference path="../pb_data/types.d.ts" />

// Game rules: a category can host several games, each with its own versioned ruleset.
// Rulesets belong to a game rule (versions count per game rule) and each round picks the
// game rule its games are scored with. Existing rulesets become the category's "main" game.
// See docs/specifications/M2-scoring-rulesets.md#game-rules.
migrate(
  (app) => {
    const categories = app.findCollectionByNameOrId('categories')

    const gameRules = new Collection({
      type: 'base',
      name: 'game_rules',
      fields: [
        {
          type: 'relation',
          name: 'category',
          required: true,
          collectionId: categories.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'text', name: 'key', required: true, max: 64, pattern: '^[A-Za-z][A-Za-z0-9_-]*$' },
        { type: 'text', name: 'name', required: true, max: 100 },
        { type: 'text', name: 'description', max: 2000 },
        { type: 'number', name: 'position', onlyInt: true, min: 0 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_game_rules_category_key` ON `game_rules` (`category`, `key`)',
      ],
    })
    app.save(gameRules)

    const rulesets = app.findCollectionByNameOrId('rulesets')
    rulesets.fields.add(
      new RelationField({
        name: 'game_rule',
        collectionId: gameRules.id,
        maxSelect: 1,
        cascadeDelete: true,
      }),
    )
    rulesets.indexes = rulesets.indexes.filter((i) => !i.includes('idx_rulesets_category_version'))
    app.save(rulesets)

    const rounds = app.findCollectionByNameOrId('rounds')
    rounds.fields.add(
      new RelationField({ name: 'game_rule', collectionId: gameRules.id, maxSelect: 1 }),
    )
    app.save(rounds)

    // Backfill: one "main" game rule per category that already has rulesets. Raw SQL so the
    // immutability hook for published rulesets is not involved.
    const rows = arrayOf(new DynamicModel({ category: '' }))
    app.db().newQuery('SELECT DISTINCT category FROM rulesets').all(rows)
    for (const row of rows) {
      const rule = new Record(gameRules)
      rule.set('category', row.category)
      rule.set('key', 'main')
      rule.set('name', 'Main game')
      rule.set('position', 1)
      app.save(rule)
      app
        .db()
        .newQuery('UPDATE rulesets SET game_rule = {:rule} WHERE category = {:category}')
        .bind({ rule: rule.id, category: row.category })
        .execute()
      app
        .db()
        .newQuery('UPDATE rounds SET game_rule = {:rule} WHERE category = {:category}')
        .bind({ rule: rule.id, category: row.category })
        .execute()
    }

    const updated = app.findCollectionByNameOrId('rulesets')
    updated.indexes.push(
      'CREATE UNIQUE INDEX `idx_rulesets_game_rule_version` ON `rulesets` (`game_rule`, `version`)',
      // Replaces the dropped (category, version) index for listing a category's versions.
      'CREATE INDEX `idx_rulesets_category` ON `rulesets` (`category`)',
    )
    // The game rule of a version never changes.
    updated.updateRule = `${updated.updateRule} && (@request.body.game_rule:isset = false || @request.body.game_rule = game_rule)`
    app.save(updated)

    // Game rules: visible and managed like their category (same rules as rounds).
    gameRules.listRule = rounds.listRule
    gameRules.viewRule = rounds.viewRule
    gameRules.createRule = rounds.createRule
    gameRules.updateRule = rounds.updateRule
    gameRules.deleteRule = rounds.deleteRule
    app.save(gameRules)
  },
  (app) => {
    const rulesets = app.findCollectionByNameOrId('rulesets')
    rulesets.updateRule = rulesets.updateRule.replace(
      ' && (@request.body.game_rule:isset = false || @request.body.game_rule = game_rule)',
      '',
    )
    rulesets.indexes = rulesets.indexes.filter(
      (i) => !i.includes('idx_rulesets_game_rule_version') && !i.includes('idx_rulesets_category`'),
    )
    rulesets.fields.removeByName('game_rule')
    app.save(rulesets)
    const rounds = app.findCollectionByNameOrId('rounds')
    rounds.fields.removeByName('game_rule')
    app.save(rounds)
    app.delete(app.findCollectionByNameOrId('game_rules'))
    // Versions may now repeat within a category; the old unique index is not restored.
  },
)
