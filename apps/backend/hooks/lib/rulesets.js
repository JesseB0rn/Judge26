/// <reference path="../../pb_data/types.d.ts" />

/**
 * Validates a ruleset that is being published and stamps publication metadata.
 * Drafts may be incomplete; only publication requires a valid definition (M2-12).
 */
function preparePublication(app, record) {
  if (record.getString('status') !== 'published') return
  const engine = require(`${__hooks}/lib/scoring-engine.js`)
  let definition = null
  try {
    definition = JSON.parse(record.getString('definition') || 'null')
  } catch (_) {
    // reported as invalid below
  }
  const result = engine.validateRuleset(definition)
  if (!result.ok) {
    const summary = result.issues
      .slice(0, 5)
      .map((i) => `${i.path}: ${i.message}`)
      .join(' ')
    throw new BadRequestError('The ruleset is invalid and cannot be published.', {
      definition: new ValidationError('invalid_ruleset', summary),
    })
  }
  record.set('fingerprint', engine.fingerprint(result.ruleset.definition))
  if (record.getDateTime('published_at').isZero()) record.set('published_at', new DateTime())
}

/** Latest published version of a game rule, or null. */
function activeRuleset(app, gameRuleId) {
  if (!gameRuleId) return null
  const found = app.findRecordsByFilter(
    'rulesets',
    'game_rule = {:rule} && status = "published"',
    '-version',
    1,
    0,
    { rule: gameRuleId },
  )
  return found.length ? found[0] : null
}

/** Game rules of a category, in display order. */
function gameRules(app, categoryId) {
  return app.findRecordsByFilter('game_rules', 'category = {:c}', 'position,key', 0, 0, {
    c: categoryId,
  })
}

/**
 * The game rule a round is scored with: the round's own, else the category's only game rule
 * (so a category with a single game needs no per-round setup). Null when there is none.
 */
function gameRuleIdForRound(app, round) {
  const own = round.getString('game_rule')
  if (own) return own
  const rules = gameRules(app, round.getString('category'))
  return rules.length === 1 ? rules[0].id : ''
}

/** Active ruleset of the round's game rule, or null (points are then entered directly). */
function activeRulesetForRound(app, round) {
  return activeRuleset(app, gameRuleIdForRound(app, round))
}

module.exports = {
  preparePublication,
  activeRuleset,
  gameRules,
  gameRuleIdForRound,
  activeRulesetForRound,
}
