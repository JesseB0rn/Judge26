/// <reference path="../../pb_data/types.d.ts" />

// M8-B: judge invitations (docs/specifications/M8-invitations.md).
//
// Managers invite people to an event by name and email (one by one or from a CSV). A person
// without an active account gets an account, the role and an invitation email with a single-use
// link to choose a password; a person with an account gets the role and an "added to event"
// email. Tokens are random, stored only as a SHA-256 hash and valid for VALID_DAYS.

const VALID_DAYS = 14
const MAX_ROWS = 500
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Roles a manager can give; admins may also invite event managers. */
const MANAGER_ROLES = ['judge', 'head_judge']
const ADMIN_ROLES = ['event_manager', 'head_judge', 'judge']

/** PocketBase's stored date format, comparable as text. */
function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ')
}

/** Timestamp (ms) of a stored date, or 0. */
function ms(value) {
  const text = String(value || '')
  return text ? Date.parse(text.replace(' ', 'T')) || 0 : 0
}

/** Status of an invitation record: invited | expired | accepted | revoked. */
function statusOf(invitation, now) {
  if (invitation.getString('revoked_at')) return 'revoked'
  if (invitation.getString('accepted_at')) return 'accepted'
  if (ms(invitation.getString('expires_at')) <= (now || Date.now())) return 'expired'
  return 'invited'
}

/**
 * Validates the submitted rows ({ name, email, role? }). Pure: returns one entry per row with
 * the normalized values and `errors`; later rows with an email seen before are `duplicate` and
 * merged into the first one (M8-07).
 */
function normalizeRows(rows, allowedRoles) {
  if (!Array.isArray(rows)) return { error: 'Rows must be a list.' }
  if (rows.length === 0) return { error: 'There are no rows to invite.' }
  if (rows.length > MAX_ROWS) return { error: `At most ${MAX_ROWS} people can be invited at once.` }
  const seen = {}
  return {
    rows: rows.map((row, index) => {
      const source = row && typeof row === 'object' ? row : {}
      const name = String(source.name || '').trim()
      const email = String(source.email || '')
        .trim()
        .toLowerCase()
      const role = String(source.role || 'judge').trim() || 'judge'
      const line = typeof source.line === 'number' ? source.line : index + 1
      const errors = []
      if (!name) errors.push('name_required')
      else if (name.length > 200) errors.push('name_too_long')
      if (!email) errors.push('email_required')
      else if (!EMAIL.test(email)) errors.push('invalid_email')
      if (allowedRoles.indexOf(role) === -1) errors.push('invalid_role')
      const entry = { line, name, email, role, errors, status: errors.length ? 'invalid' : '' }
      if (!errors.length) {
        if (seen[email]) entry.status = 'duplicate'
        seen[email] = true
      }
      return entry
    }),
  }
}

function findUser(app, email) {
  try {
    return app.findAuthRecordByEmail('users', email)
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
 * What inviting the row would do: `invite` (no account, or one that was never activated: an
 * invitation email), `add` (an active account: the role and an "added" email) or `already` (has
 * this role in the event: nothing).
 */
function classify(app, eventId, row) {
  const user = findUser(app, row.email)
  if (user && hasRole(app, user.id, eventId, row.role) && user.getBool('verified')) return 'already'
  if (!user || !user.getBool('verified')) return 'invite'
  return 'add'
}

/** Rows with their status (invalid, duplicate, invite, add, already) without changing anything. */
function preview(app, eventId, rows) {
  return rows.map((row) => (row.status ? row : { ...row, status: classify(app, eventId, row) }))
}

function grantRole(app, userId, eventId, role) {
  if (hasRole(app, userId, eventId, role)) return
  const record = new Record(app.findCollectionByNameOrId('role_assignments'))
  record.set('user', userId)
  record.set('event', eventId)
  record.set('role', role)
  app.save(record)
}

function invitationFor(app, userId, eventId) {
  try {
    return app.findFirstRecordByFilter('invitations', 'user = {:u} && event = {:e}', {
      u: userId,
      e: eventId,
    })
  } catch (_) {
    return null
  }
}

function inviterName(app, auth) {
  if (!auth || auth.isSuperuser()) return app.settings().meta.appName || 'Judge26'
  return auth.getString('name') || auth.email()
}

function inviterLanguage(auth) {
  return auth && !auth.isSuperuser() ? auth.getString('language') : ''
}

function formatDate(msValue, language) {
  const d = new Date(msValue)
  const pad = (n) => String(n).padStart(2, '0')
  if (language === 'en')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

/**
 * Creates or renews the invitation of `user` to the event and queues the invitation email with a
 * fresh link. The previous link of that invitation stops working.
 */
function sendInvitation(app, options) {
  const { user, event, role, auth } = options
  const mail = require(`${__hooks}/lib/mail.js`)
  const i18n = require(`${__hooks}/lib/i18n.js`)
  const now = Date.now()
  const expires = now + VALID_DAYS * 24 * 60 * 60 * 1000
  const token = $security.randomString(48)
  const invitation =
    invitationFor(app, user.id, event.id) || new Record(app.findCollectionByNameOrId('invitations'))
  invitation.set('user', user.id)
  invitation.set('event', event.id)
  invitation.set('role', role)
  invitation.set('token_hash', $security.sha256(token))
  invitation.set('expires_at', pbDate(expires))
  invitation.set('sent_at', pbDate(now))
  invitation.set('accepted_at', '')
  invitation.set('revoked_at', '')
  invitation.set('invited_by', auth && !auth.isSuperuser() ? auth.id : '')
  app.save(invitation)

  const language = i18n.language(user.getString('language') || inviterLanguage(auth))
  mail.enqueue(app, {
    template: 'invitation',
    to: user.email(),
    event: event.id,
    immediate: true,
    language,
    vars: {
      name: user.getString('name'),
      event_name: event.getString('name'),
      role_name: i18n.t(language, `role_${role}`),
      inviter_name: inviterName(app, auth),
      action_url: `${mail.appUrl(app)}/auth/invitation?token=${token}`,
      expires_on: formatDate(expires, language),
      app_name: app.settings().meta.appName || 'Judge26',
    },
  })
  return invitation
}

function sendEventAccess(app, options) {
  const { user, event, role, auth } = options
  const mail = require(`${__hooks}/lib/mail.js`)
  const i18n = require(`${__hooks}/lib/i18n.js`)
  const language = i18n.languageOf(app, { userId: user.id })
  mail.enqueue(app, {
    template: 'event_access',
    to: user.email(),
    event: event.id,
    immediate: true,
    language,
    vars: {
      name: user.getString('name'),
      event_name: event.getString('name'),
      role_name: i18n.t(language, `role_${role}`),
      inviter_name: inviterName(app, auth),
      action_url: `${mail.appUrl(app)}/login`,
      app_name: app.settings().meta.appName || 'Judge26',
    },
  })
}

/** Invites the validated rows (run inside a transaction). Returns the rows with their outcome. */
function invite(app, event, rows, auth) {
  const users = app.findCollectionByNameOrId('users')
  return rows.map((row) => {
    if (row.status === 'invalid' || row.status === 'duplicate') return row
    const status = classify(app, event.id, row)
    if (status === 'already') return { ...row, status }
    let user = findUser(app, row.email)
    if (!user) {
      user = new Record(users)
      user.setEmail(row.email)
      user.setPassword($security.randomString(32))
      user.setVerified(false)
      user.set('name', row.name)
      app.save(user)
    } else if (!user.getBool('verified')) {
      // Never activated: the invitation decides the name, the accepted link the password.
      user.set('name', row.name)
      app.save(user)
    }
    grantRole(app, user.id, event.id, row.role)
    if (status === 'invite') sendInvitation(app, { user, event, role: row.role, auth })
    else sendEventAccess(app, { user, event, role: row.role, auth })
    return { ...row, status, user: user.id }
  })
}

/** The invitation with this link token, or null. */
function findByToken(app, token) {
  if (!token || typeof token !== 'string' || token.length < 20) return null
  try {
    return app.findFirstRecordByFilter('invitations', 'token_hash = {:h}', {
      h: $security.sha256(token),
    })
  } catch (_) {
    return null
  }
}

/** Revokes the invitation and removes the role it granted. */
function revoke(app, invitation) {
  invitation.set('revoked_at', pbDate(Date.now()))
  invitation.set('token_hash', '')
  app.save(invitation)
  try {
    const assignment = app.findFirstRecordByFilter(
      'role_assignments',
      'user = {:u} && event = {:e} && role = {:r}',
      {
        u: invitation.getString('user'),
        e: invitation.getString('event'),
        r: invitation.getString('role'),
      },
    )
    app.delete(assignment)
  } catch (_) {
    // Already removed.
  }
}

/**
 * Accepts an invitation: sets the password, activates the account and marks every open
 * invitation of the user accepted (their roles were granted when they were sent).
 */
function accept(app, invitation, password, passwordConfirm) {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  if (typeof password !== 'string' || password.length < 8) {
    fieldError('password', 'too_short', 'The password must have at least 8 characters.')
  }
  if (password !== passwordConfirm) {
    fieldError('passwordConfirm', 'mismatch', 'The passwords do not match.')
  }
  const user = app.findRecordById('users', invitation.getString('user'))
  user.setPassword(password)
  user.setVerified(true)
  app.save(user)
  const now = pbDate(Date.now())
  app
    .findRecordsByFilter(
      'invitations',
      'user = {:u} && accepted_at = "" && revoked_at = ""',
      '',
      0,
      0,
      {
        u: user.id,
      },
    )
    .forEach((record) => {
      record.set('accepted_at', now)
      record.set('token_hash', '')
      app.save(record)
    })
  return user
}

/**
 * The event's staff for its managers (M8-09): every role assignment with the user's name, email,
 * activation and invitation status (active, invited, expired), and revoked invitations.
 */
function staff(app, eventId) {
  const now = Date.now()
  const invitations = {}
  app
    .findRecordsByFilter('invitations', 'event = {:e}', '', 0, 0, { e: eventId })
    .forEach((record) => (invitations[record.getString('user')] = record))
  const describe = (invitation) =>
    invitation
      ? {
          id: invitation.id,
          status: statusOf(invitation, now),
          sent_at: invitation.getString('sent_at'),
          expires_at: invitation.getString('expires_at'),
          accepted_at: invitation.getString('accepted_at'),
        }
      : null
  const userInfo = (id) => {
    const user = app.findRecordById('users', id)
    return {
      id,
      name: user.getString('name'),
      email: user.email(),
      verified: user.getBool('verified'),
    }
  }
  const members = app
    .findRecordsByFilter('role_assignments', 'event = {:e}', 'role', 0, 0, { e: eventId })
    .map((assignment) => {
      const user = userInfo(assignment.getString('user'))
      const invitation = describe(invitations[user.id])
      const status = user.verified
        ? 'active'
        : invitation && invitation.status === 'expired'
          ? 'expired'
          : 'invited'
      return { id: assignment.id, role: assignment.getString('role'), user, status, invitation }
    })
  const revoked = Object.keys(invitations)
    .map((id) => invitations[id])
    .filter((record) => statusOf(record, now) === 'revoked')
    .map((record) => ({
      id: '',
      role: record.getString('role'),
      user: userInfo(record.getString('user')),
      status: 'revoked',
      invitation: describe(record),
    }))
  return members.concat(revoked)
}

// --- Route helpers (hooks/invitations.pb.js) ---------------------------------

/** Route guard: managers of the event in the path. Returns { event, admin, roles }. */
function requireStaffManager(e, eventId) {
  const access = require(`${__hooks}/lib/access.js`)
  if (!access.isVerifiedUser(e.auth) || !access.canManageEvent(e.app, e.auth, eventId)) {
    throw new ForbiddenError('Only event managers and admins can manage the event staff.', {
      _error: new ValidationError(
        'managers_only',
        'Only event managers and admins can manage the event staff.',
      ),
    })
  }
  let event
  try {
    event = e.app.findRecordById('events', eventId)
  } catch (_) {
    throw new NotFoundError('The event was not found.', {
      _error: new ValidationError('event_not_found', 'The event was not found.'),
    })
  }
  const admin = access.isAdmin(e.app, e.auth)
  return { event, admin, roles: admin ? ADMIN_ROLES : MANAGER_ROLES }
}

function requireWritable(event) {
  if (event.getString('status') === 'archived') {
    throw new BadRequestError('Archived events are read-only.', {
      _error: new ValidationError('event_archived', 'Archived events are read-only.'),
    })
  }
}

/** The submitted rows, validated; throws 400 for a malformed request. */
function rowsOf(e, roles) {
  const result = normalizeRows(e.requestInfo().body.rows, roles)
  if (result.error) {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    fieldError('rows', 'invalid_rows', result.error)
  }
  return result.rows
}

function countRows(rows) {
  const counts = { invite: 0, add: 0, already: 0, duplicate: 0, invalid: 0 }
  rows.forEach((row) => (counts[row.status] = (counts[row.status] || 0) + 1))
  return counts
}

function auditRoute(e, entry) {
  const log = require(`${__hooks}/lib/audit.js`)
  log.log(e.app, { auth: e.auth, ip: log.requestIp(e), ...entry })
}

/** Route guard for an invitation in the path: its event's managers. */
function requireInvitation(e) {
  let invitation
  try {
    invitation = e.app.findRecordById('invitations', e.request.pathValue('id'))
  } catch (_) {
    throw new NotFoundError('The invitation was not found.', {
      _error: new ValidationError('invitation_not_found', 'The invitation was not found.'),
    })
  }
  const ctx = requireStaffManager(e, invitation.getString('event'))
  if (ctx.roles.indexOf(invitation.getString('role')) === -1) {
    throw new ForbiddenError('Only admins can manage invitations of event managers.', {
      _error: new ValidationError(
        'admins_only',
        'Only admins can manage invitations of event managers.',
      ),
    })
  }
  return { invitation, ...ctx }
}

module.exports = {
  requireStaffManager,
  requireWritable,
  rowsOf,
  countRows,
  auditRoute,
  requireInvitation,
  VALID_DAYS,
  MAX_ROWS,
  MANAGER_ROLES,
  ADMIN_ROLES,
  statusOf,
  normalizeRows,
  preview,
  invite,
  sendInvitation,
  grantRole,
  findByToken,
  revoke,
  accept,
  staff,
}
