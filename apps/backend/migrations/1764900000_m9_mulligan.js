/// <reference path="../pb_data/types.d.ts" />

// M9-A: mulligan runs. A head judge can discard a scored run after a catastrophic failure; the
// sheet returns to an empty draft and the table judge scores the re-run. See
// docs/specifications/M5-judging.md#mulligan-m9-a.
//
// - score_sheets: how many mulligans were granted, and the last one's reason, reviewer and time.
// - score_audit.action: new value `mulligan` (the discarded run is kept in `before`).

const ACTIONS = ['submitted', 'approved', 'rejected', 'corrected', 'manual_edit']

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const sheets = app.findCollectionByNameOrId('score_sheets')
    sheets.fields.add(new NumberField({ name: 'mulligans', onlyInt: true, min: 0 }))
    sheets.fields.add(new TextField({ name: 'mulligan_reason', max: 2000 }))
    sheets.fields.add(
      new RelationField({ name: 'mulligan_by', collectionId: users.id, maxSelect: 1 }),
    )
    sheets.fields.add(new DateField({ name: 'mulligan_at' }))
    app.save(sheets)

    const audit = app.findCollectionByNameOrId('score_audit')
    audit.fields.getByName('action').values = ACTIONS.concat(['mulligan'])
    app.save(audit)
  },
  (app) => {
    app
      .findRecordsByFilter('score_audit', 'action = "mulligan"', '', 0, 0)
      .forEach((entry) => app.unsafeWithoutHooks().delete(entry))
    const audit = app.findCollectionByNameOrId('score_audit')
    audit.fields.getByName('action').values = ACTIONS
    app.save(audit)

    const sheets = app.findCollectionByNameOrId('score_sheets')
    ;['mulligans', 'mulligan_reason', 'mulligan_by', 'mulligan_at'].forEach((name) =>
      sheets.fields.removeByName(name),
    )
    app.save(sheets)
  },
)
