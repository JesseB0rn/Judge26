/// <reference path="../pb_data/types.d.ts" />

// The game rules migration dropped the (category, version) index, the only index on
// rulesets.category; listing a category's versions then scanned the whole table.
migrate(
  (app) => {
    const rulesets = app.findCollectionByNameOrId('rulesets')
    rulesets.indexes.push('CREATE INDEX `idx_rulesets_category` ON `rulesets` (`category`)')
    app.save(rulesets)
  },
  (app) => {
    const rulesets = app.findCollectionByNameOrId('rulesets')
    rulesets.indexes = rulesets.indexes.filter((i) => !i.includes('idx_rulesets_category`'))
    app.save(rulesets)
  },
)
