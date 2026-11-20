/// <reference path="../../pb_data/types.d.ts" />

// M11-10, M11-11: creating an event through the record API. A new event is always a draft
// (superusers excepted), and the empty-event dialog may send an optional `first_day`
// ({ date, starts_at, ends_at }) that becomes the event's first competition day.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** M11-10: only superusers create an event in another status than draft. */
function requireDraft(e) {
  const record = e.record
  const status = record.getString('status')
  if (!status) {
    record.set('status', 'draft')
    return
  }
  if (status === 'draft' || (e.auth && e.auth.isSuperuser())) return
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  fieldError('status', 'event_create_draft', 'A new event is always created as a draft.')
}

/**
 * M11-11: the validated first day of the request body, or null when none was sent. Validated
 * before the event is saved, so an invalid day creates neither.
 */
function firstDay(e) {
  const body = e.requestInfo().body || {}
  let day = body.first_day
  if (typeof day === 'string') {
    try {
      day = JSON.parse(day)
    } catch (_) {
      day = { date: day }
    }
  }
  if (day === undefined || day === null || day === '') return null
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  if (typeof day !== 'object' || !day.date) return null
  const date = String(day.date)
  const startsAt = day.starts_at ? String(day.starts_at) : ''
  const endsAt = day.ends_at ? String(day.ends_at) : ''
  if (!validDate(date)) {
    fieldError('first_day', 'invalid_date', 'Must be a valid calendar date (YYYY-MM-DD).')
  }
  if ((startsAt && !TIME.test(startsAt)) || (endsAt && !TIME.test(endsAt))) {
    fieldError('first_day', 'invalid_time', 'Times must be given as HH:MM.')
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    fieldError('first_day', 'invalid_range', 'The day must end after it starts.')
  }
  return { date, starts_at: startsAt, ends_at: endsAt }
}

/** Creates the first day of a just saved event; deletes the event again should that fail. */
function createFirstDay(app, event, day) {
  try {
    const record = new Record(app.findCollectionByNameOrId('competition_days'))
    record.set('event', event.id)
    record.set('date', day.date)
    record.set('starts_at', day.starts_at)
    record.set('ends_at', day.ends_at)
    app.save(record)
  } catch (err) {
    try {
      app.delete(event)
    } catch (_) {
      // the event could not be removed; the original error is what the caller needs
    }
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    fieldError('first_day', 'invalid_day', 'The first day could not be created.')
  }
}

module.exports = { requireDraft, firstDay, createFirstDay }
