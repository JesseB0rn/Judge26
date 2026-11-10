/// <reference path="../pb_data/types.d.ts" />

// M1-09: copy a category (template or event category) into an event or the
// template library. The copy is fully independent: settings are deep-copied and
// later changes to the source never affect it. The source's game rules are copied,
// each with its active (latest published) ruleset as version 1 (M2); rounds keep
// their game rule, and the ranking configuration is copied too (M3).
//
// POST /api/categories/{id}/copy  { event?: string, name?: string, code?: string }
routerAdd(
  'POST',
  '/api/categories/{id}/copy',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const auth = e.auth
    if (!access.isVerifiedUser(auth)) throw new ForbiddenError('Please verify your email address.')

    const source = e.app.findRecordById('categories', e.request.pathValue('id'))
    const sourceRule = source.collection().viewRule
    if (!auth.isSuperuser() && !e.app.canAccessRecord(source, e.requestInfo(), sourceRule)) {
      throw new NotFoundError('Category not found.')
    }

    const body = e.requestInfo().body
    const targetEvent = typeof body.event === 'string' ? body.event : ''
    const allowed = targetEvent
      ? access.canManageEvent(e.app, auth, targetEvent)
      : access.isAdmin(e.app, auth)
    if (!allowed) throw new ForbiddenError('You cannot create categories here.')
    if (targetEvent) {
      const event = e.app.findRecordById('events', targetEvent)
      if (event.getString('status') === 'archived') {
        throw new BadRequestError('Archived events cannot be changed.')
      }
    }

    const copy = new Record(source.collection())
    for (const field of [
      'description',
      'min_age',
      'max_age',
      'min_team_size',
      'max_team_size',
      'max_teams',
    ]) {
      copy.set(field, source.get(field))
    }
    copy.set(
      'name',
      typeof body.name === 'string' && body.name ? body.name : source.getString('name'),
    )
    copy.set(
      'code',
      typeof body.code === 'string' && body.code ? body.code : source.getString('code'),
    )
    copy.set('event', targetEvent)
    copy.set('source', source.id)
    // Deep copy via JSON round-trip so no structure is shared.
    const settings = source.getString('settings')
    copy.set('settings', settings ? JSON.parse(settings) : null)
    const ranking = source.getString('ranking')
    copy.set('ranking', ranking ? JSON.parse(ranking) : null)

    e.app.runInTransaction((txApp) => {
      txApp.save(copy)
      // Game rules (each with its active version as version 1) and rounds are part of the
      // category's structure.
      const lib = require(`${__hooks}/lib/rulesets.js`)
      const ruleIds = {}
      lib.gameRules(txApp, source.id).forEach((r) => {
        const rule = new Record(r.collection())
        rule.set('category', copy.id)
        for (const field of ['key', 'name', 'description', 'position'])
          rule.set(field, r.get(field))
        txApp.save(rule)
        ruleIds[r.id] = rule.id
        const active = lib.activeRuleset(txApp, r.id)
        if (active) {
          const ruleset = new Record(active.collection())
          ruleset.set('category', copy.id)
          ruleset.set('game_rule', rule.id)
          ruleset.set('status', 'published')
          ruleset.set('definition', JSON.parse(active.getString('definition')))
          ruleset.set(
            'notes',
            `Copied from version ${active.getInt('version')} of ${source.getString('code')}.`,
          )
          ruleset.set('source', active.id)
          txApp.save(ruleset)
        }
      })
      txApp
        .findRecordsByFilter('rounds', 'category = {:c}', 'position', 0, 0, { c: source.id })
        .forEach((r) => {
          const round = new Record(r.collection())
          round.set('category', copy.id)
          round.set('key', r.getString('key'))
          round.set('name', r.getString('name'))
          round.set('position', r.getInt('position'))
          round.set('game_rule', ruleIds[r.getString('game_rule')] || '')
          txApp.save(round)
        })
    })
    return e.json(201, copy)
  },
  $apis.requireAuth('users', '_superusers'),
)
