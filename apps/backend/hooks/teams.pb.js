/// <reference path="../pb_data/types.d.ts" />

// Team registration workflow (M1-10, M1-11, M1-12).

onRecordValidate((e) => {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const teams = require(`${__hooks}/lib/teams.js`)
  const team = e.record

  const category = e.app.findRecordById('categories', team.getString('category'))
  if (category.getString('event') !== team.getString('event')) {
    fieldError('category', 'invalid_category', 'The category does not belong to this event.')
  }

  // JSON fields are raw bytes in the JSVM; parse explicitly.
  const raw = team.getString('members')
  let members
  try {
    members = raw ? JSON.parse(raw) : null
  } catch (_) {
    members = undefined
  }
  const memberErrors = teams.validateMembers(members)
  if (memberErrors.length) fieldError('members', 'invalid_members', memberErrors.join(' '))

  if (teams.COMPLETE_STATUSES.indexOf(team.getString('status')) !== -1) {
    const event = e.app.findRecordById('events', team.getString('event'))
    const errors = teams.validateCompleteness(members, category, event.getInt('season'))
    if (errors.length) fieldError('members', 'incomplete_team', errors.join(' '))
  }
  e.next()
}, 'teams')

onRecordCreateRequest((e) => {
  const team = e.record
  const auth = e.auth

  if (!team.getString('coach_email') && auth && !auth.isSuperuser()) {
    team.set('coach_email', auth.email())
  }
  if (!team.getString('coach_name') && auth && team.getString('coach') === auth.id) {
    team.set('coach_name', auth.getString('name'))
  }
  // Imported teams: link an existing account by email.
  if (!team.getString('coach') && team.getString('coach_email')) {
    try {
      const user = e.app.findAuthRecordByEmail('users', team.getString('coach_email'))
      team.set('coach', user.id)
    } catch (_) {
      // No account yet.
    }
  }

  const status = team.getString('status')
  if (status === 'rejected' || status === 'withdrawn') {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    fieldError('status', 'invalid_status', `New registrations cannot start as ${status}.`)
  }
  if (status !== 'draft') require(`${__hooks}/lib/teams.js`).applyStatusChange(e, '')
  e.next()
}, 'teams')

onRecordUpdateRequest((e) => {
  const { applyStatusChange } = require(`${__hooks}/lib/teams.js`)
  applyStatusChange(e, e.record.original().getString('status'))
  e.next()
}, 'teams')
