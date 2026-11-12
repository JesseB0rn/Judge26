/// <reference path="../pb_data/types.d.ts" />

// M8-B: judge invitations and the event staff list for managers.
// See docs/specifications/M8-invitations.md and hooks/lib/invitations.js.
//
// Managers (and admins)        GET    /api/events/{id}/staff
//                              DELETE /api/events/{id}/staff/{assignment}
//                              POST   /api/events/{id}/invitations/preview  { rows }
//                              POST   /api/events/{id}/invitations          { rows }
//                              POST   /api/invitations/{id}/resend
//                              POST   /api/invitations/{id}/revoke
// Anyone with the link         GET    /api/invitations/lookup?token=
//                              POST   /api/invitations/accept { token, password, passwordConfirm }

routerAdd(
  'GET',
  '/api/events/{id}/staff',
  (e) => {
    const lib = require(`${__hooks}/lib/invitations.js`)
    const { event } = lib.requireStaffManager(e, e.request.pathValue('id'))
    return e.json(200, lib.staff(e.app, event.id))
  },
  $apis.requireAuth('users', '_superusers'),
)

// Managers remove judges and head judges; admins remove any role of the event.
routerAdd(
  'DELETE',
  '/api/events/{id}/staff/{assignment}',
  (e) => {
    const lib = require(`${__hooks}/lib/invitations.js`)
    const { event, roles } = lib.requireStaffManager(e, e.request.pathValue('id'))
    let assignment
    try {
      assignment = e.app.findRecordById('role_assignments', e.request.pathValue('assignment'))
    } catch (_) {
      assignment = null
    }
    if (!assignment || assignment.getString('event') !== event.id) {
      throw new NotFoundError('The staff member was not found.', {
        _error: new ValidationError('staff_not_found', 'The staff member was not found.'),
      })
    }
    if (roles.indexOf(assignment.getString('role')) === -1) {
      throw new ForbiddenError('Only admins can remove event managers.', {
        _error: new ValidationError('admins_only', 'Only admins can remove event managers.'),
      })
    }
    const user = e.app.findRecordById('users', assignment.getString('user'))
    e.app.runInTransaction((tx) => {
      tx.delete(assignment)
      // An open invitation for that role is revoked with it.
      try {
        const invitation = tx.findFirstRecordByFilter(
          'invitations',
          'user = {:u} && event = {:e} && role = {:r} && accepted_at = "" && revoked_at = ""',
          { u: user.id, e: event.id, r: assignment.getString('role') },
        )
        lib.revoke(tx, invitation)
      } catch (_) {
        // No open invitation.
      }
    })
    lib.auditRoute(e, {
      action: 'staff.remove',
      collection: 'role_assignments',
      record: assignment.id,
      event: event.id,
      summary: `Removed ${user.getString('name') || user.email()} (${assignment.getString('role')})`,
      changes: { role: assignment.getString('role'), user: user.id },
    })
    return e.noContent(204)
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/events/{id}/invitations/preview',
  (e) => {
    const lib = require(`${__hooks}/lib/invitations.js`)
    const { event, roles } = lib.requireStaffManager(e, e.request.pathValue('id'))
    const rows = lib.preview(e.app, event.id, lib.rowsOf(e, roles))
    return e.json(200, { rows, counts: lib.countRows(rows) })
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/events/{id}/invitations',
  (e) => {
    const lib = require(`${__hooks}/lib/invitations.js`)
    const { event, roles } = lib.requireStaffManager(e, e.request.pathValue('id'))
    lib.requireWritable(event)
    const input = lib.rowsOf(e, roles)
    let rows = []
    e.app.runInTransaction((tx) => {
      rows = lib.invite(tx, event, input, e.auth)
    })
    const counts = lib.countRows(rows)
    lib.auditRoute(e, {
      action: 'staff.invite',
      collection: 'invitations',
      event: event.id,
      summary: `Invited ${counts.invite} and added ${counts.add} staff member${counts.invite + counts.add === 1 ? '' : 's'}`,
      changes: counts,
    })
    return e.json(200, { rows: rows.map(({ user, ...row }) => row), counts })
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/invitations/{id}/resend',
  (e) => {
    const lib = require(`${__hooks}/lib/invitations.js`)
    const { invitation, event } = lib.requireInvitation(e)
    lib.requireWritable(event)
    if (invitation.getString('accepted_at')) {
      throw new BadRequestError('The invitation was already accepted.', {
        _error: new ValidationError('invitation_accepted', 'The invitation was already accepted.'),
      })
    }
    const user = e.app.findRecordById('users', invitation.getString('user'))
    let saved
    e.app.runInTransaction((tx) => {
      lib.grantRole(tx, user.id, event.id, invitation.getString('role'))
      saved = lib.sendInvitation(tx, {
        user,
        event,
        role: invitation.getString('role'),
        auth: e.auth,
      })
    })
    lib.auditRoute(e, {
      action: 'invitation.resend',
      collection: 'invitations',
      record: invitation.id,
      event: event.id,
      summary: `Sent the invitation to ${user.email()} again`,
    })
    return e.json(200, {
      id: saved.id,
      status: lib.statusOf(saved),
      expires_at: saved.getString('expires_at'),
    })
  },
  $apis.requireAuth('users', '_superusers'),
)

routerAdd(
  'POST',
  '/api/invitations/{id}/revoke',
  (e) => {
    const lib = require(`${__hooks}/lib/invitations.js`)
    const { invitation, event } = lib.requireInvitation(e)
    if (invitation.getString('accepted_at')) {
      throw new BadRequestError(
        'Accepted invitations cannot be revoked; remove the role instead.',
        {
          _error: new ValidationError(
            'invitation_accepted',
            'Accepted invitations cannot be revoked; remove the role instead.',
          ),
        },
      )
    }
    e.app.runInTransaction((tx) => lib.revoke(tx, invitation))
    lib.auditRoute(e, {
      action: 'invitation.revoke',
      collection: 'invitations',
      record: invitation.id,
      event: event.id,
      summary: `Revoked the invitation of ${e.app.findRecordById('users', invitation.getString('user')).email()}`,
    })
    return e.json(200, { id: invitation.id, status: 'revoked' })
  },
  $apis.requireAuth('users', '_superusers'),
)

// Public: what the link is for. Details are only returned for a usable link.
routerAdd('GET', '/api/invitations/lookup', (e) => {
  const lib = require(`${__hooks}/lib/invitations.js`)
  const invitation = lib.findByToken(e.app, e.request.url.query().get('token'))
  if (!invitation) return e.json(200, { status: 'invalid' })
  const status = lib.statusOf(invitation)
  if (status !== 'invited') return e.json(200, { status })
  const user = e.app.findRecordById('users', invitation.getString('user'))
  const event = e.app.findRecordById('events', invitation.getString('event'))
  return e.json(200, {
    status,
    name: user.getString('name'),
    email: user.email(),
    role: invitation.getString('role'),
    event: { id: event.id, name: event.getString('name') },
    expires_at: invitation.getString('expires_at'),
  })
})

routerAdd('POST', '/api/invitations/accept', (e) => {
  const lib = require(`${__hooks}/lib/invitations.js`)
  const body = e.requestInfo().body
  const invitation = lib.findByToken(e.app, body.token)
  const status = invitation ? lib.statusOf(invitation) : 'invalid'
  if (status !== 'invited') {
    throw new BadRequestError('This invitation link is no longer valid.', {
      _error: new ValidationError(
        `invitation_${status}`,
        'This invitation link is no longer valid.',
      ),
    })
  }
  let user
  e.app.runInTransaction((tx) => {
    user = lib.accept(tx, invitation, body.password, body.passwordConfirm)
  })
  const log = require(`${__hooks}/lib/audit.js`)
  log.log(e.app, {
    auth: user,
    action: 'invitation.accept',
    collection: 'invitations',
    record: invitation.id,
    event: invitation.getString('event'),
    summary: `${user.email()} accepted the invitation`,
    ip: log.requestIp(e),
  })
  return e.json(200, {
    email: user.email(),
    role: invitation.getString('role'),
    event: invitation.getString('event'),
  })
})
