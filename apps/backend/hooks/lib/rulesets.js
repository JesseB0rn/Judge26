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

/** Latest published version of a category, or null. */
function activeRuleset(app, categoryId) {
  const found = app.findRecordsByFilter(
    'rulesets',
    'category = {:category} && status = "published"',
    '-version',
    1,
    0,
    { category: categoryId },
  )
  return found.length ? found[0] : null
}

module.exports = { preparePublication, activeRuleset }
