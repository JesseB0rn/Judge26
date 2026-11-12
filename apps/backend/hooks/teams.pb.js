/// <reference path="../pb_data/types.d.ts" />

// Teams (M1-12, M8-A): event managers import or create them; managers withdraw and
// reactivate them. Nobody owns a team; coach_name/coach_email are the optional contact.

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
