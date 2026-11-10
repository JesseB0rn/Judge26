/// <reference path="../pb_data/types.d.ts" />

// M2: versioned rulesets. The scoring engine bundle (hooks/lib/scoring-engine.js) is
// generated from packages/scoring-engine by `pnpm --filter @judge26/scoring-engine build:hooks`.

// Attach the version to a game rule and assign the next version number of that game rule.
// Without a game rule, the category's only game rule is used (a "main" one is created for a
// category that has none yet); with several game rules, one must be chosen.
onRecordCreate((e) => {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const lib = require(`${__hooks}/lib/rulesets.js`)
  const category = e.record.getString('category')
  if (!e.record.getString('game_rule')) {
    const rules = lib.gameRules(e.app, category)
    if (rules.length > 1) fieldError('game_rule', 'required', 'Choose the game rule.')
    let rule = rules[0]
    if (!rule) {
      rule = new Record(e.app.findCollectionByNameOrId('game_rules'))
      rule.set('category', category)
      rule.set('key', 'main')
      rule.set('name', 'Main game')
      rule.set('position', 1)
      e.app.save(rule)
    }
    e.record.set('game_rule', rule.id)
  }
  const latest = e.app.findRecordsByFilter('rulesets', 'game_rule = {:rule}', '-version', 1, 0, {
    rule: e.record.getString('game_rule'),
  })
  e.record.set('version', latest.length ? latest[0].getInt('version') + 1 : 1)
  lib.preparePublication(e.app, e.record)
  e.next()
}, 'rulesets')

// A version's game rule belongs to the version's category.
onRecordValidate((e) => {
  const ruleId = e.record.getString('game_rule')
  let rule = null
  try {
    rule = ruleId ? e.app.findRecordById('game_rules', ruleId) : null
  } catch (_) {
    rule = null
  }
  if (!rule || rule.getString('category') !== e.record.getString('category')) {
    require(`${__hooks}/lib/errors.js`).fieldError(
      'game_rule',
      'invalid_game_rule',
      'Choose a game rule of this category.',
    )
  }
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

// A game rule whose published versions scored results cannot be deleted: the results would
// lose the ruleset they were calculated with. (Request hook: deleting the whole category
// still cascades.)
onRecordDeleteRequest((e) => {
  const used = e.app.findRecordsByFilter(
    'rulesets',
    'game_rule = {:rule} && status = "published"',
    '',
    0,
    0,
    { rule: e.record.id },
  )
  for (const version of used) {
    const filter = 'ruleset = {:ruleset}'
    const params = { ruleset: version.id }
    if (
      e.app.findRecordsByFilter('games', filter, '', 1, 0, params).length ||
      e.app.findRecordsByFilter('score_sheets', filter, '', 1, 0, params).length
    ) {
      throw new BadRequestError(
        'This game rule has been used to score results and cannot be deleted.',
      )
    }
  }
  e.next()
}, 'game_rules')

// A round's game rule belongs to the round's category.
onRecordValidate((e) => {
  const ruleId = e.record.getString('game_rule')
  if (ruleId) {
    let rule = null
    try {
      rule = e.app.findRecordById('game_rules', ruleId)
    } catch (_) {
      rule = null
    }
    if (!rule || rule.getString('category') !== e.record.getString('category')) {
      require(`${__hooks}/lib/errors.js`).fieldError(
        'game_rule',
        'invalid_game_rule',
        'Choose a game rule of this category.',
      )
    }
  }
  e.next()
}, 'rounds')

// A game rule stays in its category.
onRecordUpdate((e) => {
  if (e.record.getString('category') !== e.record.original().getString('category')) {
    throw new BadRequestError('A game rule cannot be moved to another category.')
  }
  e.next()
}, 'game_rules')
