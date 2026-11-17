/// <reference path="../pb_data/types.d.ts" />

// Run time format of an event: when set, run times are shown as seconds only ("95.37") instead
// of minutes:seconds ("1:35.37"). Off by default (also when empty). Display only — ranking and
// stored milliseconds are unaffected. Complements time_decimals (M10-19).

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.add(new BoolField({ name: 'time_seconds_only' }))
    app.save(events)
  },
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    events.fields.removeByName('time_seconds_only')
    app.save(events)
  },
)
