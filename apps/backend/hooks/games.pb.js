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

// M4-T12: two administrators editing the same game. A schedule change over the API must state
// the `updated` value it was based on; if the game changed since, the request is refused.
// Only direct API requests are checked, so the server-side generator is not affected.
onRecordUpdateRequest((e) => {
  const body = e.requestInfo().body || {}
  const scheduleKeys = ['table', 'starts_at', 'judges'].filter((key) => key in body)
  if (scheduleKeys.length > 0) {
    const stored = e.app.findRecordById('games', e.record.id)
    if (body.expected_updated !== stored.getString('updated')) {
      throw new ApiError(
        409,
        'The game was changed by someone else. Reload the schedule and try again.',
        {},
      )
    }
  }
  e.next()
}, 'games')
