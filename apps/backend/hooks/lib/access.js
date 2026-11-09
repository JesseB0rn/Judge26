/// <reference path="../../pb_data/types.d.ts" />

// Authorization helpers for hooks and custom routes. API rules in the M1 migration
// remain the primary enforcement; these mirror them for custom endpoints.

function exists(app, collection, filter, params) {
  try {
    app.findFirstRecordByFilter(collection, filter, params)
    return true
  } catch (_) {
    return false
  }
}

function isAdmin(app, auth) {
  if (!auth) return false
  if (auth.isSuperuser()) return true
  return exists(app, 'role_assignments', 'user = {:user} && role = "admin"', { user: auth.id })
}

function hasEventRole(app, auth, eventId, roles) {
  if (!auth || !eventId) return false
  return roles.some((role) =>
    exists(app, 'role_assignments', 'user = {:user} && event = {:event} && role = {:role}', {
      user: auth.id,
      event: eventId,
      role,
    }),
  )
}

function canManageEvent(app, auth, eventId) {
  return isAdmin(app, auth) || hasEventRole(app, auth, eventId, ['event_manager'])
}

/** Verified user or superuser. */
function isVerifiedUser(auth) {
  return !!auth && (auth.isSuperuser() || auth.getBool('verified'))
}

module.exports = { isAdmin, hasEventRole, canManageEvent, isVerifiedUser }
