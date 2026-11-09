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
