/// <reference path="../../pb_data/types.d.ts" />

// M8-C: admins view the app as an event manager, head judge or judge of an event
// (docs/specifications/M8-view-as.md).
//
// Switching issues a real, non-refreshable auth token for another account, so the API rules
// and route checks apply exactly as for that account (M8-14):
// - by role: the admin's stand-in account (users.preview_of = admin), which holds only the
//   chosen role while the session lasts;
// - as a person (M8-16): that person's account, read-only, so nothing is written in their name.
// Sessions are stored with the token's hash; the middleware in hooks/view_as.pb.js refuses tokens
// of ended or expired sessions and writes of person sessions.

const HOURS = 4
const ROLES = ['event_manager', 'head_judge', 'judge']
/** Requests a read-only session may still make (live updates, file links, ending it). */
const READ_ONLY_ALLOWED = ['/api/realtime', '/api/files/token', '/api/view-as/end']

function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ')
}

function ms(value) {
  const text = String(value || '')
  return text ? Date.parse(text.replace(' ', 'T')) || 0 : 0
}

function forbidden(code, message) {
  throw new ForbiddenError(message, { _error: new ValidationError(code, message) })
}

function badRequest(code, message) {
  throw new BadRequestError(message, { _error: new ValidationError(code, message) })
}

/** The bearer token of a request, or "". */
function tokenOf(e) {
  const header = String(e.request.header.get('Authorization') || '')
  return header.replace(/^Bearer\s+/i, '').trim()
}

/** Whether a token is non-refreshable, i.e. could have been issued by a switch. */
function isStaticToken(token) {
  if (!token) return false
  try {
    return $security.parseUnverifiedJWT(token).refreshable === false
  } catch (_) {
    return false
  }
}

/** The view session a token belongs to, or null. */
function sessionOfToken(app, token) {
  if (!isStaticToken(token)) return null
  try {
    return app.findFirstRecordByFilter('view_sessions', 'token_hash = {:h}', {
      h: $security.sha256(token),
    })
  } catch (_) {
    return null
  }
}

function isActive(session, now) {
  return !session.getString('ended_at') && ms(session.getString('expires_at')) > (now || Date.now())
}

/** The active session of a stand-in account, or null (audit attribution). */
function activeSessionOfStandIn(app, userId) {
  try {
    const sessions = app.findRecordsByFilter(
      'view_sessions',
      'user = {:u} && persona = false && ended_at = ""',
      '-created',
      1,
      0,
      { u: userId },
    )
    return sessions.length ? sessions[0] : null
  } catch (_) {
    return null
  }
}

/** The admin's stand-in account, created on first use. */
function standInFor(app, admin) {
  try {
    return app.findFirstRecordByFilter('users', 'preview_of = {:a}', { a: admin.id })
  } catch (_) {
    // Created below.
  }
  const record = new Record(app.findCollectionByNameOrId('users'))
  const password = $security.randomString(40)
  record.set('email', `preview-${admin.id}@preview.invalid`)
  record.set('emailVisibility', false)
  record.set('password', password)
  record.set('passwordConfirm', password)
  record.set('verified', true)
  record.set('preview_of', admin.id)
  record.set('language', admin.getString('language'))
  record.set('name', `${admin.getString('name') || admin.email()} (preview)`)
  app.save(record)
  return record
}

function clearRoles(app, userId) {
  app
    .findRecordsByFilter('role_assignments', 'user = {:u}', '', 0, 0, { u: userId })
    .forEach((record) => app.delete(record))
}

/** Ends a session; a stand-in loses its role and every token it was given. */
function end(app, session) {
  if (!session.getString('ended_at')) {
    session.set('ended_at', pbDate(Date.now()))
    app.save(session)
  }
  if (session.getBool('persona')) return
  const standIn = app.findRecordById('users', session.getString('user'))
  clearRoles(app, standIn.id)
  standIn.refreshTokenKey()
  app.save(standIn)
}

function endAllOf(app, adminId) {
  app
    .findRecordsByFilter('view_sessions', 'admin = {:a} && ended_at = ""', '', 0, 0, {
      a: adminId,
    })
    .forEach((session) => end(app, session))
}

function findById(app, collection, id) {
  if (!id || typeof id !== 'string') return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

function hasRole(app, userId, eventId, role) {
  try {
    app.findFirstRecordByFilter('role_assignments', 'user = {:u} && event = {:e} && role = {:r}', {
      u: userId,
      e: eventId,
      r: role,
    })
    return true
  } catch (_) {
    return false
  }
}

/**
 * Starts a session for `admin`: { event, role, user? } → { session, user, token }.
 * Ends the admin's earlier sessions. Runs in a transaction.
 */
function start(app, admin, body) {
  const role = String(body.role || '')
  if (ROLES.indexOf(role) === -1) badRequest('invalid_role', 'Choose a role of the event.')
  const event = findById(app, 'events', body.event)
  if (!event) badRequest('event_not_found', 'The event was not found.')

  let user
  const persona = !!body.user
  if (persona) {
    user = findById(app, 'users', body.user)
    const access = require(`${__hooks}/lib/access.js`)
    if (
      !user ||
      user.getString('preview_of') ||
      !hasRole(app, user.id, event.id, role) ||
      access.isAdmin(app, user)
    ) {
      badRequest('person_not_found', 'This person does not have the role in the event.')
    }
    if (!user.getBool('verified')) {
      badRequest('person_not_activated', 'This person has not activated their account yet.')
    }
  }

  endAllOf(app, admin.id)
  if (!persona) {
    user = standInFor(app, admin)
    clearRoles(app, user.id)
    const assignment = new Record(app.findCollectionByNameOrId('role_assignments'))
    assignment.set('user', user.id)
    assignment.set('event', event.id)
    assignment.set('role', role)
    app.save(assignment)
  }

  const token = user.newStaticAuthToken(HOURS * 3600 * 1000 * 1000 * 1000)
  const session = new Record(app.findCollectionByNameOrId('view_sessions'))
  session.set('admin', admin.id)
  session.set('user', user.id)
  session.set('event', event.id)
  session.set('role', role)
  session.set('persona', persona)
  session.set('token_hash', $security.sha256(token))
  session.set('expires_at', pbDate(Date.now() + HOURS * 3600 * 1000))
  app.save(session)
  return { session, user, token }
}

function person(user) {
  return user ? { id: user.id, name: user.getString('name'), email: user.email() } : null
}

/** What the banner shows. */
function describe(app, session) {
  const admin = findById(app, 'users', session.getString('admin'))
  const event = findById(app, 'events', session.getString('event'))
  const persona = session.getBool('persona')
  return {
    id: session.id,
    role: session.getString('role'),
    event: { id: session.getString('event'), name: event ? event.getString('name') : '' },
    persona: persona ? person(findById(app, 'users', session.getString('user'))) : null,
    read_only: persona,
    admin: person(admin),
    expires_at: session.getString('expires_at'),
  }
}

/** The auth record as the web app stores it. */
function authRecord(user) {
  return {
    id: user.id,
    collectionId: user.collection().id,
    collectionName: 'users',
    name: user.getString('name'),
    email: user.email(),
    emailVisibility: false,
    verified: user.getBool('verified'),
    language: user.getString('language'),
  }
}

/** "judge · Event (as Jane Doe)", for the audit log. */
function label(app, session) {
  const event = findById(app, 'events', session.getString('event'))
  const parts = [`${session.getString('role')} · ${event ? event.getString('name') : ''}`]
  if (session.getBool('persona')) {
    const user = findById(app, 'users', session.getString('user'))
    if (user) parts.push(`as ${user.getString('name') || user.email()}`)
  }
  return parts.join(' ')
}

module.exports = {
  HOURS,
  READ_ONLY_ALLOWED,
  tokenOf,
  isStaticToken,
  sessionOfToken,
  isActive,
  activeSessionOfStandIn,
  start,
  end,
  endAllOf,
  describe,
  authRecord,
  label,
  forbidden,
}
