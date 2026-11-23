/// <reference path="../pb_data/types.d.ts" />

// Deleting an event removes its teams first, in the same transaction. That deletes their games
// and score sheets before PocketBase cascades into categories, rulesets and tables. Otherwise
// the cascade would hit three failures:
// - `teams.category` is required and does not cascade (a category with teams stays protected),
// - deleting a ruleset updates its games, and the game checks look up the category that is
//   already being deleted,
// - a table cannot be deleted while games still point at it.
onRecordDelete((e) => {
  const teams = e.app.findRecordsByFilter('teams', 'event = {:event}', '', 0, 0, {
    event: e.record.id,
  })
  for (const team of teams) e.app.delete(team)
  e.next()
}, 'events')

// M11-10, M11-11: a new event is a draft; an optional first day is created right after it.
onRecordCreateRequest((e) => {
  const events = require(`${__hooks}/lib/events.js`)
  events.requireDraft(e)
  const day = events.firstDay(e)
  e.next()
  if (day) events.createFirstDay(e.app, e.record, day)
}, 'events')
