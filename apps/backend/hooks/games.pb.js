/// <reference path="../pb_data/types.d.ts" />

// M3: games belong to exactly one round; points derive from score sheets.
onRecordCreate((e) => {
  require(`${__hooks}/lib/games.js`).prepareGame(e.app, e.record)
  e.next()
}, 'games')

onRecordUpdate((e) => {
  require(`${__hooks}/lib/games.js`).prepareGame(e.app, e.record)
  e.next()
}, 'games')

// M5: concurrent schedule edits must include the version they were based on. M7-T10: any other
// edit (e.g. a manually recorded result) that states its version is refused when outdated too.
// A schedule change over the API must state
// the `updated` value it was based on; if the game changed since, the request is refused.
// Only direct API requests are checked, so the server-side generator is not affected.
onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/concurrency.js`).versionedUpdate(
    e,
    (body) => 'table' in body || 'sequence' in body || 'expected_updated' in body,
    'The game was changed by someone else. Reload and try again.',
  )
}, 'games')
