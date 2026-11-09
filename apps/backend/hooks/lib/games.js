/// <reference path="../../pb_data/types.d.ts" />

/**
 * Validates a game and derives its points (M3-02, M3-03). When a published
 * ruleset of the game's category is attached, points are computed from the
 * score sheet values by the scoring engine; manual points are then ignored.
 */
function prepareGame(app, game) {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  if (game.getInt('attempt') === 0) game.set('attempt', 1)

  const round = app.findRecordById('rounds', game.getString('round'))
  const team = app.findRecordById('teams', game.getString('team'))
  if (team.getString('category') !== round.getString('category')) {
    fieldError('team', 'invalid_team', 'The team is not registered in this round’s category.')
  }
  if (team.getString('status') !== 'approved') {
    fieldError('team', 'team_not_approved', 'Only approved teams can play games.')
  }
  require(`${__hooks}/lib/schedule.js`).checkPlacement(app, game, round)

  const status = game.getString('status')
  if (status !== 'completed') {
    // Scheduled, disqualified and absent games carry no score.
    game.set('points', null)
    if (status !== 'scheduled') game.set('values', null)
    return
  }

  const rulesetId = game.getString('ruleset')
  // Without a ruleset, points are entered directly (0 is a valid zero-point result).
  if (!rulesetId) return

  const ruleset = app.findRecordById('rulesets', rulesetId)
  if (
    ruleset.getString('category') !== round.getString('category') ||
    ruleset.getString('status') !== 'published'
  ) {
    fieldError('ruleset', 'invalid_ruleset', 'Use a published ruleset of this category.')
  }
  const engine = require(`${__hooks}/lib/scoring-engine.js`)
  const compiled = engine.compileRuleset(JSON.parse(ruleset.getString('definition')))
  const values = JSON.parse(game.getString('values') || '{}') || {}
  const result = engine.evaluate(compiled, values, { mode: 'final' })
  if (!result.valid) {
    fieldError(
      'values',
      'invalid_score_sheet',
      result.issues
        .slice(0, 5)
        .map((i) => i.message)
        .join(' '),
    )
  }
  game.set('points', result.total)
}

module.exports = { prepareGame }
