/// <reference path="../pb_data/types.d.ts" />

// M2: versioned rulesets. The scoring engine bundle (hooks/lib/scoring-engine.js) is
// generated from packages/scoring-engine by `pnpm --filter @judge26/scoring-engine build:hooks`.

// Assign the next version number per category.
onRecordCreate((e) => {
  const latest = e.app.findRecordsByFilter('rulesets', 'category = {:category}', '-version', 1, 0, {
    category: e.record.getString('category'),
  })
  e.record.set('version', latest.length ? latest[0].getInt('version') + 1 : 1)
  require(`${__hooks}/lib/rulesets.js`).preparePublication(e.app, e.record)
  e.next()
}, 'rulesets')

// Published versions are immutable for everyone, including superusers (M2-14).
onRecordUpdate((e) => {
  if (e.record.original().getString('status') === 'published') {
    throw new BadRequestError('Published rulesets cannot be changed. Create a new version instead.')
  }
  require(`${__hooks}/lib/rulesets.js`).preparePublication(e.app, e.record)
  e.next()
}, 'rulesets')

onRecordUpdateRequest((e) => {
  const publishing =
    e.record.getString('status') === 'published' &&
    e.record.original().getString('status') !== 'published'
  if (publishing && e.auth && !e.auth.isSuperuser()) e.record.set('published_by', e.auth.id)
  e.next()
}, 'rulesets')

// POST /api/rulesets/{id}/evaluate  { values, mode? } -> evaluation result
// Evaluates score sheet values with exactly this ruleset version (M2-T11).
routerAdd(
  'POST',
  '/api/rulesets/{id}/evaluate',
  (e) => {
    const ruleset = e.app.findRecordById('rulesets', e.request.pathValue('id'))
    if (
      !e.auth.isSuperuser() &&
      !e.app.canAccessRecord(ruleset, e.requestInfo(), ruleset.collection().viewRule)
    ) {
      throw new NotFoundError('Ruleset not found.')
    }
    const engine = require(`${__hooks}/lib/scoring-engine.js`)
    const body = e.requestInfo().body
    const values = body.values && typeof body.values === 'object' ? body.values : {}
    const mode = body.mode === 'draft' ? 'draft' : 'final'

    const validation = engine.validateRuleset(JSON.parse(ruleset.getString('definition') || 'null'))
    if (!validation.ok) {
      throw new BadRequestError('The ruleset is invalid.', {
        definition: new ValidationError('invalid_ruleset', validation.issues[0].message),
      })
    }
    const result = engine.evaluate(validation.ruleset, values, { mode })
    return e.json(200, {
      ruleset: ruleset.id,
      version: ruleset.getInt('version'),
      fingerprint:
        ruleset.getString('fingerprint') || engine.fingerprint(validation.ruleset.definition),
      total: result.total,
      valid: result.valid,
      issues: result.issues,
      explanation: result.explanation,
    })
  },
  $apis.requireAuth('users', '_superusers'),
)
