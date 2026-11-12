/// <reference path="../pb_data/types.d.ts" />

// M8-E: assignment board. See docs/specifications/M8-board.md.
//
// - tables.judge (one judge) becomes tables.judges (several); every judge of a table scores its
//   games. Access rules that named `table.judge` now test `table.judges`.
// - categories.judges_per_table: the number of judge slots of the category's tables (default 2).
// - Existing tables with several categories keep them; the board shows them as unsorted until a
//   manager gives them one category.

const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']

// JSVM boxes rule strings; normalize to plain text.
function ruleText(value) {
  return value === null || value === undefined ? null : String(value)
}

function rewriteRules(app, from, to) {
  app.findAllCollections().forEach((collection) => {
    let changed = false
    RULES.forEach((name) => {
      const rule = ruleText(collection[name])
      if (rule === null || !from.test(rule)) return
      collection[name] = rule.replace(new RegExp(from.source, 'g'), to)
      changed = true
    })
    if (changed) app.save(collection)
  })
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const tables = app.findCollectionByNameOrId('tables')
    tables.fields.add(new RelationField({ name: 'judges', collectionId: users.id, maxSelect: 10 }))
    app.save(tables)
    app.findRecordsByFilter('tables', 'judge != ""', '', 0, 0).forEach((table) => {
      table.set('judges', [table.getString('judge')])
      app.unsafeWithoutHooks().save(table)
    })

    // `game.table.judge = @request.auth.id` → any judge of the table.
    // (`judges.id`: PocketBase does not match `judges ?= …` on this multiple relation.)
    rewriteRules(app, /table\.judge = @request\.auth\.id/, 'table.judges.id ?= @request.auth.id')
    app.findAllCollections().forEach((collection) => {
      RULES.forEach((name) => {
        const rule = ruleText(collection[name])
        if (rule && /table\.judge\b(?!s)/.test(rule)) {
          throw new Error(`${collection.name}.${name} still uses table.judge`)
        }
      })
    })

    const updated = app.findCollectionByNameOrId('tables')
    updated.fields.removeByName('judge')
    app.save(updated)

    const categories = app.findCollectionByNameOrId('categories')
    categories.fields.add(
      new NumberField({ name: 'judges_per_table', onlyInt: true, min: 1, max: 10 }),
    )
    app.save(categories)
  },
  (app) => {
    const categories = app.findCollectionByNameOrId('categories')
    categories.fields.removeByName('judges_per_table')
    app.save(categories)

    const users = app.findCollectionByNameOrId('users')
    const tables = app.findCollectionByNameOrId('tables')
    tables.fields.add(new RelationField({ name: 'judge', collectionId: users.id, maxSelect: 1 }))
    app.save(tables)
    app.findRecordsByFilter('tables', '', '', 0, 0).forEach((table) => {
      table.set('judge', table.getStringSlice('judges')[0] || '')
      app.unsafeWithoutHooks().save(table)
    })
    rewriteRules(app, /table\.judges\.id \?= @request\.auth\.id/, 'table.judge = @request.auth.id')
    const updated = app.findCollectionByNameOrId('tables')
    updated.fields.removeByName('judges')
    app.save(updated)
  },
)
