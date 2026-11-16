/// <reference path="../pb_data/types.d.ts" />

// M10-A: the team confirms the score sheet's verdict before submission (M10-06).
// - score_sheets.team_confirmed_at: when the team confirmed (slide to confirm);
// - score_sheets.team_refused_at / team_refusal_reason: the judge recorded that the team refused;
// - events.allow_team_refusal: whether refusals are allowed at all (off by default).
// Submitting a completed or disqualified run needs one of the two (hooks/lib/judging.js).
// A mulligan or a returned sheet clears them. See docs/specifications/M5-judging.md.

migrate(
  (app) => {
    const sheets = app.findCollectionByNameOrId('score_sheets')
    sheets.fields.add(new DateField({ name: 'team_confirmed_at' }))
    sheets.fields.add(new DateField({ name: 'team_refused_at' }))
    sheets.fields.add(new TextField({ name: 'team_refusal_reason', max: 1000 }))
    app.save(sheets)
    const events = app.findCollectionByNameOrId('events')
    events.fields.add(new BoolField({ name: 'allow_team_refusal' }))
    app.save(events)
  },
  (app) => {
    const sheets = app.findCollectionByNameOrId('score_sheets')
    for (const name of ['team_confirmed_at', 'team_refused_at', 'team_refusal_reason']) {
      sheets.fields.removeByName(name)
    }
    app.save(sheets)
    const events = app.findCollectionByNameOrId('events')
    events.fields.removeByName('allow_team_refusal')
    app.save(events)
  },
)
