/// <reference path="../pb_data/types.d.ts" />

// Cross-field validation that cannot be expressed as field options.
// Note: handlers run in isolated contexts, so helpers are required inside them.

onRecordValidate((e) => {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const opens = e.record.getDateTime('registration_opens_at')
  const closes = e.record.getDateTime('registration_closes_at')
  if (!opens.isZero() && !closes.isZero() && !opens.before(closes)) {
    fieldError('registration_closes_at', 'invalid_range', 'Registration must close after it opens.')
  }
  e.next()
}, 'events')

onRecordValidate((e) => {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const value = e.record.getString('date')
  const parsed = new Date(`${value}T00:00:00Z`)
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fieldError('date', 'invalid_date', 'Must be a valid calendar date (YYYY-MM-DD).')
  }
  e.next()
}, 'competition_days')

onRecordValidate((e) => {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const r = e.record
  const pairs = [
    ['min_age', 'max_age', 'Maximum age must not be lower than minimum age.'],
    [
      'min_team_size',
      'max_team_size',
      'Maximum team size must not be lower than minimum team size.',
    ],
  ]
  for (const [minField, maxField, message] of pairs) {
    const min = r.getInt(minField)
    const max = r.getInt(maxField)
    if (min > 0 && max > 0 && max < min) fieldError(maxField, 'invalid_range', message)
  }
  e.next()
}, 'categories')

onRecordValidate((e) => {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const role = e.record.getString('role')
  const event = e.record.getString('event')
  if (role === 'admin' && event) {
    fieldError('event', 'not_allowed', 'The admin role is global and cannot be scoped to an event.')
  }
  if (role !== 'admin' && !event) {
    fieldError('event', 'required', 'This role must be scoped to an event.')
  }
  e.next()
}, 'role_assignments')
