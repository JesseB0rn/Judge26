/// <reference path="../pb_data/types.d.ts" />

// M10-25: how an event labels its tables ("Table 1", "1", "Table A" or "A"). New tables get the
// next label of the scheme; "relabel all" renames every table in board order
// (POST /api/events/{id}/board/labels, hooks/board.pb.js). Empty means the default, "table_number".

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.add(
      new SelectField({
        name: 'table_labels',
        maxSelect: 1,
        values: ['table_number', 'number', 'table_letter', 'letter'],
      }),
    )
    app.save(events)
  },
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.removeByName('table_labels')
    app.save(events)
  },
)
