/// <reference path="../../pb_data/types.d.ts" />

// Team rules (M1-12, M8-A). Pure functions where possible so the rules are easy to read
// next to docs/specifications/M1-teams.md.

/**
 * Allowed status transitions. Teams are active (`approved`) or `withdrawn`; draft, submitted
 * and rejected only remain on teams registered before M8-A, and lead to either.
 */
const TRANSITIONS = {
  draft: ['approved', 'withdrawn'],
  submitted: ['approved', 'withdrawn'],
  approved: ['withdrawn'],
  rejected: ['approved', 'withdrawn'],
  withdrawn: ['approved'],
}

/** Statuses that require a complete, valid team. */
const COMPLETE_STATUSES = ['submitted', 'approved']

function canTransition(from, to) {
  return from === to || (TRANSITIONS[from] || []).indexOf(to) !== -1
}

/** Returns a list of error messages for the members array (shape only). */
function validateMembers(members) {
  if (members === null || members === undefined || members === '') return []
  if (!Array.isArray(members)) return ['Members must be a list.']
  const errors = []
  members.forEach((m, i) => {
    const n = i + 1
    if (!m || typeof m !== 'object') {
      errors.push(`Member ${n} is invalid.`)
      return
    }
    if (typeof m.first_name !== 'string' || !m.first_name.trim()) {
      errors.push(`Member ${n}: first name is required.`)
    }
    if (typeof m.last_name !== 'string' || !m.last_name.trim()) {
      errors.push(`Member ${n}: last name is required.`)
    }
    const year = m.birth_year
    if (typeof year !== 'number' || Math.floor(year) !== year || year < 1900 || year > 2100) {
      errors.push(`Member ${n}: birth year must be a whole number between 1900 and 2100.`)
    }
  })
  return errors
}

/**
 * Checks a team against its category before submission/approval.
 * Age is calculated as `season - birth_year` (WRO convention).
 */
function validateCompleteness(members, category, season) {
  const list = Array.isArray(members) ? members : []
  const errors = []
  const min = category.getInt('min_team_size')
  const max = category.getInt('max_team_size')
  if (list.length === 0) errors.push('A team needs at least one member.')
  if (min > 0 && list.length < min) errors.push(`The category requires at least ${min} members.`)
  if (max > 0 && list.length > max) errors.push(`The category allows at most ${max} members.`)

  const minAge = category.getInt('min_age')
  const maxAge = category.getInt('max_age')
  list.forEach((m, i) => {
    if (typeof m.birth_year !== 'number') return
    const age = season - m.birth_year
    if (minAge > 0 && age < minAge) {
      errors.push(`Member ${i + 1} is ${age} in ${season}; minimum age is ${minAge}.`)
    }
    if (maxAge > 0 && age > maxAge) {
      errors.push(`Member ${i + 1} is ${age} in ${season}; maximum age is ${maxAge}.`)
    }
  })
  return errors
}

/**
 * Validates a status change on a team request event and stamps submission/review
 * metadata. `from` is '' for new records.
 */
function applyStatusChange(e, from) {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const team = e.record
  const to = team.getString('status')
  if (from === to) return

  if (from && !canTransition(from, to)) {
    fieldError('status', 'invalid_transition', `Cannot change status from ${from} to ${to}.`)
  }
  if (to === 'rejected' && !team.getString('review_note').trim()) {
    fieldError('review_note', 'required', 'A reason is required when rejecting a registration.')
  }
  if (to === 'approved') {
    const category = e.app.findRecordById('categories', team.getString('category'))
    const limit = category.getInt('max_teams')
    if (limit > 0) {
      const approved = e.app.countRecords(
        'teams',
        $dbx.hashExp({ category: category.id, status: 'approved' }),
        $dbx.not($dbx.hashExp({ id: team.id })),
      )
      if (approved >= limit) {
        fieldError('status', 'category_full', `The category is full (${limit} approved teams).`)
      }
    }
  }

  const now = new DateTime()
  if (to === 'submitted') team.set('submitted_at', now)
  if (to === 'approved' || to === 'rejected') {
    team.set('reviewed_at', now)
    team.set('reviewed_by', e.auth && !e.auth.isSuperuser() ? e.auth.id : '')
  }
}

module.exports = {
  applyStatusChange,
  TRANSITIONS,
  COMPLETE_STATUSES,
  canTransition,
  validateMembers,
  validateCompleteness,
}
