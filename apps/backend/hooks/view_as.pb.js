/// <reference path="../pb_data/types.d.ts" />

// M8-C: admins view the app as an event manager, head judge or judge of an event.
// See docs/specifications/M8-view-as.md and hooks/lib/view_as.js.
//
// Admins (own account)        POST /api/view-as      { event, role, user? } → { token, record, session }
// The switched session        GET  /api/view-as      → { session }
//                             POST /api/view-as/end

routerAdd(
  'POST',
  '/api/view-as',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const lib = require(`${__hooks}/lib/view_as.js`)
    const auth = e.auth
    // M8-18: only admins, with their own account (a switched session cannot switch again).
    if (
      !auth ||
      auth.isSuperuser() ||
      !access.isVerifiedUser(auth) ||
      auth.getString('preview_of') ||
      lib.sessionOfToken(e.app, lib.tokenOf(e)) ||
      !access.isAdmin(e.app, auth)
    ) {
      lib.forbidden('admins_only', 'Only administrators can view the app as another role.')
    }
    const body = e.requestInfo().body
    let started
    e.app.runInTransaction((tx) => {
      started = lib.start(tx, auth, body)
    })
    const audit = require(`${__hooks}/lib/audit.js`)
    audit.log(e.app, {
      auth,
      action: 'view_as.start',
      collection: 'view_sessions',
      record: started.session.id,
      event: started.session.getString('event'),
      summary: `Started viewing as ${lib.label(e.app, started.session)}`,
      viewAs: lib.label(e.app, started.session),
      ip: audit.requestIp(e),
    })
    return e.json(200, {
      token: started.token,
      record: lib.authRecord(started.user),
      session: lib.describe(e.app, started.session),
    })
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'GET',
  '/api/view-as',
  (e) => {
    const lib = require(`${__hooks}/lib/view_as.js`)
    const session = lib.sessionOfToken(e.app, lib.tokenOf(e))
    if (!session || !lib.isActive(session)) {
      throw new NotFoundError('No active view session.', {
        _error: new ValidationError('no_view_session', 'No active view session.'),
      })
    }
    return e.json(200, { session: lib.describe(e.app, session) })
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/view-as/end',
  (e) => {
    const lib = require(`${__hooks}/lib/view_as.js`)
    const session = lib.sessionOfToken(e.app, lib.tokenOf(e))
    if (!session) {
      throw new NotFoundError('No active view session.', {
        _error: new ValidationError('no_view_session', 'No active view session.'),
      })
    }
    const label = lib.label(e.app, session)
    const wasActive = !session.getString('ended_at')
    e.app.runInTransaction((tx) => lib.end(tx, session))
    if (wasActive) {
      const audit = require(`${__hooks}/lib/audit.js`)
      audit.log(e.app, {
        auth: e.app.findRecordById('users', session.getString('admin')),
        action: 'view_as.end',
        collection: 'view_sessions',
        record: session.id,
        event: session.getString('event'),
        summary: `Stopped viewing as ${label}`,
        viewAs: label,
        ip: audit.requestIp(e),
      })
    }
    return e.noContent(204)
  },
  $apis.requireAuth('users'),
)

// M8-14: tokens of ended or expired sessions are refused; a session as a person is read-only.
routerUse((e) => {
  if (!e.auth || e.auth.isSuperuser()) return e.next()
  const lib = require(`${__hooks}/lib/view_as.js`)
  const token = lib.tokenOf(e)
  if (!lib.isStaticToken(token)) return e.next()
  const session = lib.sessionOfToken(e.app, token)
  if (!session) return e.next()
  const path = e.request.url.path
  if (!lib.isActive(session) && path !== '/api/view-as/end') {
    throw new UnauthorizedError('The view session has ended.', {
      _error: new ValidationError('view_session_ended', 'The view session has ended.'),
    })
  }
  const method = e.request.method
  const reads = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  if (session.getBool('persona') && !reads && lib.READ_ONLY_ALLOWED.indexOf(path) === -1) {
    lib.forbidden('view_as_read_only', 'Viewing as a person is read-only.')
  }
  return e.next()
})

// Stand-in accounts are only used through a switch: no password sign-in, and no one can create
// or claim one through the API.
onRecordAuthWithPasswordRequest((e) => {
  if (e.record && e.record.getString('preview_of')) {
    throw new BadRequestError('Failed to authenticate.')
  }
  e.next()
}, 'users')

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    if (e.record.getString('preview_of') || /@preview\.invalid$/i.test(e.record.email())) {
      throw new BadRequestError('This email address cannot be used.', {
        email: new ValidationError(
          'validation_invalid_email',
          'This email address cannot be used.',
        ),
      })
    }
  }
  e.next()
}, 'users')

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const before = e.record.original()
    if (e.record.getString('preview_of') !== before.getString('preview_of')) {
      throw new ForbiddenError('This field cannot be changed.')
    }
  }
  e.next()
}, 'users')

onRecordRequestEmailChangeRequest((e) => {
  if (/@preview\.invalid$/i.test(String(e.newEmail || ''))) {
    throw new BadRequestError('This email address cannot be used.', {
      newEmail: new ValidationError(
        'validation_invalid_email',
        'This email address cannot be used.',
      ),
    })
  }
  e.next()
}, 'users')
