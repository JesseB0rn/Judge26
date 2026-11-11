/// <reference path="../pb_data/types.d.ts" />

// M1-05: admins assign roles by email (user emails are not otherwise searchable).
//
// POST /api/role-assignments/by-email  { email, role, event? }
routerAdd(
  'POST',
  '/api/role-assignments/by-email',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    if (!access.isVerifiedUser(e.auth) || !access.isAdmin(e.app, e.auth)) {
      throw new ForbiddenError('Only administrators can assign roles.', {
        _error: new ValidationError('admins_only', 'Only administrators can assign roles.'),
      })
    }

    const body = e.requestInfo().body
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    let user
    try {
      user = e.app.findAuthRecordByEmail('users', email)
    } catch (_) {
      fieldError('email', 'not_found', 'No user with this email address exists.')
    }

    const assignment = new Record(e.app.findCollectionByNameOrId('role_assignments'))
    assignment.set('user', user.id)
    assignment.set('role', body.role)
    assignment.set('event', typeof body.event === 'string' ? body.event : '')
    e.app.save(assignment)
    return e.json(201, assignment)
  },
  $apis.requireAuth('users', '_superusers'),
)

// Admins may see email addresses of users they can list.
onRecordEnrich((e) => {
  const auth = e.requestInfo && e.requestInfo.auth
  if (auth && auth.id !== e.record.id) {
    const access = require(`${__hooks}/lib/access.js`)
    if (access.isAdmin(e.app, auth)) e.record.ignoreEmailVisibility(true)
  }
  e.next()
}, 'users')

// Admin user search. PocketBase does not allow non-superusers to filter on the
// hidden `email` field, so searching by email needs a dedicated endpoint.
//
// GET /api/admin/users?q=<text>&limit=50  -> { items: [{ id, name, email, verified }], total }
routerAdd(
  'GET',
  '/api/admin/users',
  (e) => {
    const access = require(`${__hooks}/lib/access.js`)
    if (!access.isVerifiedUser(e.auth) || !access.isAdmin(e.app, e.auth)) {
      throw new ForbiddenError('Only administrators can list users.', {
        _error: new ValidationError('admins_only', 'Only administrators can list users.'),
      })
    }
    const query = e.request.url.query()
    const q = (query.get('q') || '').trim()
    const limit = Math.min(Math.max(parseInt(query.get('limit') || '50', 10) || 50, 1), 200)
    const filter = q ? 'name ~ {:q} || email ~ {:q}' : ''
    const records = e.app.findRecordsByFilter('users', filter, 'name,email', limit, 0, { q })
    const total = e.app.countRecords(
      'users',
      q ? $dbx.or($dbx.like('name', q), $dbx.like('email', q)) : $dbx.exp('1=1'),
    )
    return e.json(200, {
      total,
      items: records.map((r) => ({
        id: r.id,
        name: r.getString('name'),
        email: r.email(),
        verified: r.getBool('verified'),
      })),
    })
  },
  $apis.requireAuth('users', '_superusers'),
)
