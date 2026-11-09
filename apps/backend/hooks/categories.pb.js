/// <reference path="../pb_data/types.d.ts" />

// M1-09: copy a category (template or event category) into an event or the
// template library. The copy is fully independent: settings are deep-copied and
// later changes to the source never affect it.
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

    e.app.save(copy)
    return e.json(201, copy)
  },
  $apis.requireAuth('users', '_superusers'),
)
