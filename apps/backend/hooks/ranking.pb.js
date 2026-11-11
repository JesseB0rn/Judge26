/// <reference path="../pb_data/types.d.ts" />

// M3: ranking configuration validation and immutable ranking snapshots.

onRecordValidate((e) => {
  const raw = e.record.getString('ranking')
  if (raw && raw !== 'null') {
    const engine = require(`${__hooks}/lib/ranking-engine.js`)
    const result = engine.validateRankingConfig(JSON.parse(raw))
    if (!result.ok) {
      const { fieldError } = require(`${__hooks}/lib/errors.js`)
      fieldError(
        'ranking',
        'invalid_ranking_config',
        result.issues
          .slice(0, 5)
          .map((i) => `${i.path}: ${i.message}`)
          .join(' '),
      )
    }
  }
  e.next()
}, 'categories')

// Snapshots are never modified (M3-17, M3-T13), not even by superusers.
onRecordUpdate((e) => {
  throw new BadRequestError('Ranking snapshots cannot be changed.', {
    _error: new ValidationError('snapshot_immutable', 'Ranking snapshots cannot be changed.'),
  })
}, 'ranking_snapshots')

// POST /api/categories/{id}/ranking/snapshots  { title } -> snapshot record
// Computes the ranking from the current results on the server and preserves it.
routerAdd(
  'POST',
  '/api/categories/{id}/ranking/snapshots',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const category = e.app.findRecordById('categories', e.request.pathValue('id'))
    const eventId = category.getString('event')
    if (
      !access.isVerifiedUser(e.auth) ||
      !eventId ||
      !access.canManageEvent(e.app, e.auth, eventId)
    ) {
      throw new ForbiddenError('Only event managers can publish ranking snapshots.', {
        _error: new ValidationError(
          'managers_only',
          'Only event managers can publish ranking snapshots.',
        ),
      })
    }
    const title = String(e.requestInfo().body.title || '').trim()
    if (!title) {
      throw new BadRequestError('Failed to validate the submitted data.', {
        title: new ValidationError('required', 'A title is required.'),
      })
    }
    const configJson = category.getString('ranking')
    if (!configJson || configJson === 'null') {
      throw new BadRequestError('This category has no ranking configuration.', {
        _error: new ValidationError(
          'ranking_not_configured',
          'This category has no ranking configuration.',
        ),
      })
    }

    const engine = require(`${__hooks}/lib/ranking-engine.js`)
    const config = JSON.parse(configJson)
    const compiled = engine.compileRankingConfig(config)
    const inputs = require(`${__hooks}/lib/ranking.js`).loadInputs(e.app, category.id)
    const result = engine.rank(compiled, inputs)

    const snapshot = new Record(e.app.findCollectionByNameOrId('ranking_snapshots'))
    snapshot.set('category', category.id)
    snapshot.set('title', title)
    snapshot.set('config', config)
    snapshot.set('config_fingerprint', engine.fingerprint(config))
    snapshot.set('inputs', inputs)
    snapshot.set('result', result)
    snapshot.set('fingerprint', engine.fingerprint({ config, inputs, result }))
    if (!e.auth.isSuperuser()) snapshot.set('created_by', e.auth.id)
    e.app.save(snapshot)
    require(`${__hooks}/lib/audit.js`).log(e.app, {
      auth: e.auth,
      action: 'create',
      collection: 'ranking_snapshots',
      record: snapshot.id,
      event: eventId,
      summary: `Published ranking snapshot “${title}” of ${category.getString('name')}`,
      changes: { title, fingerprint: snapshot.getString('fingerprint') },
      ip: require(`${__hooks}/lib/audit.js`).requestIp(e),
    })
    return e.json(201, snapshot)
  },
  $apis.requireAuth('users', '_superusers'),
)
