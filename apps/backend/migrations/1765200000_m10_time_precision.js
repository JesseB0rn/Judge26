/// <reference path="../pb_data/types.d.ts" />

// M10-19: decimals of run times shown and used for ranking in an event: 0 (whole seconds, the
// default; also when empty) to 3 (milliseconds). Rankings cut times to this precision (M10-20,
// hooks/lib/ranking.js); measured milliseconds stay stored. See docs/specifications/M10-times.md.

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.add(new NumberField({ name: 'time_decimals', onlyInt: true, min: 0, max: 3 }))
    app.save(events)
  },
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.removeByName('time_decimals')
    app.save(events)
  },
)
