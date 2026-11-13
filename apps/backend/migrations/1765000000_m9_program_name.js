/// <reference path="../pb_data/types.d.ts" />

// M9-B: the program a team plans to run, entered by the judge at the robot check and shown on the
// score sheet above the stopwatch, so it is verified before the run starts. Set through
// PUT /api/games/{id}/program (hooks/judging.pb.js). See docs/specifications/M5-judging.md.

migrate(
  (app) => {
    const games = app.findCollectionByNameOrId('games')
    games.fields.add(new TextField({ name: 'program_name', max: 200 }))
    app.save(games)
  },
  (app) => {
    const games = app.findCollectionByNameOrId('games')
    games.fields.removeByName('program_name')
    app.save(games)
  },
)
