/// <reference path="../pb_data/types.d.ts" />

// M4-14: multi-day schedule planner. Day time windows, independently placed round phases
// (maintenance/practice, optional robot check, scoring) and custom schedule blocks.
// See docs/specifications/M4-tables-and-scheduling.md ("Schedule planner").

const TIME = '^([01][0-9]|2[0-3]):[0-5][0-9]$'
const COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink']

// Same helpers as 1763700000_scoped_access_rules.js (migrations cannot share code).
const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const T = '@request.auth.teams_via_coach'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const anyRole = (e) => `(${MINE} && ${R}.event ?= ${e})`
const isManager = (e) => `(${MINE} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`
const hasOwnTeam = (e) => `(${T}.coach ?= @request.auth.id && ${T}.event ?= ${e})`
const canSeeEvent = (e, status) =>
  `(${anyRole(e)} || ${status} = "published" || (${status} = "archived" && ${hasOwnTeam(e)}))`
const unchanged = (field) =>
  `(@request.body.${field}:isset = false || @request.body.${field} = ${field})`

migrate(
  (app) => {
    const days = app.findCollectionByNameOrId('competition_days')
    const events = app.findCollectionByNameOrId('events')
    const categories = app.findCollectionByNameOrId('categories')
    const rounds = app.findCollectionByNameOrId('rounds')

    // Time window of a day (local HH:MM). Empty means the default 08:00–18:00.
    days.fields.add(new TextField({ name: 'starts_at', pattern: TIME }))
    days.fields.add(new TextField({ name: 'ends_at', pattern: TIME }))
    app.save(days)

    // One placed (or still unplaced) phase of a round. Maintenance and scoring records are kept
    // in sync with the round by hooks; a check record exists only if the round has a robot check.
    {
      const E = 'round.category.event'
      const manage = `${AUTH} && (${IS_ADMIN} || ${isManager(E)}) && ${E}.status != "archived"`
      const phases = new Collection({
        type: 'base',
        name: 'round_phases',
        listRule: `${AUTH} && (${IS_ADMIN} || ${canSeeEvent(E, `${E}.status`)})`,
        viewRule: `${AUTH} && (${IS_ADMIN} || ${canSeeEvent(E, `${E}.status`)})`,
        // Only robot checks are added or removed over the API; the other phases follow the round.
        createRule: `${manage} && @request.body.phase = "check"`,
        updateRule: `${manage} && ${unchanged('round')} && ${unchanged('phase')}`,
        deleteRule: `${manage} && phase = "check"`,
        fields: [
          {
            type: 'relation',
            name: 'round',
            required: true,
            collectionId: rounds.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            type: 'select',
            name: 'phase',
            required: true,
            maxSelect: 1,
            values: ['maintenance', 'check', 'scoring'],
          },
          { type: 'relation', name: 'day', collectionId: days.id, maxSelect: 1 },
          { type: 'text', name: 'starts_at', pattern: TIME },
          {
            type: 'number',
            name: 'duration_minutes',
            required: true,
            onlyInt: true,
            min: 1,
            max: 1440,
          },
          { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
          { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX `idx_round_phases_round_phase` ON `round_phases` (`round`, `phase`)',
          'CREATE INDEX `idx_round_phases_day` ON `round_phases` (`day`)',
        ],
      })
      app.save(phases)
    }

    // Custom blocks: anything else on the schedule (registration, lunch, ceremonies, …).
    {
      const manage = `${AUTH} && (${IS_ADMIN} || ${isManager('event')}) && event.status != "archived"`
      const list = `${AUTH} && (${IS_ADMIN} || ${anyRole('event')} || (public = true && ${canSeeEvent('event', 'event.status')}))`
      const blocks = new Collection({
        type: 'base',
        name: 'schedule_blocks',
        listRule: list,
        viewRule: list,
        createRule: manage,
        updateRule: `${manage} && ${unchanged('event')}`,
        deleteRule: manage,
        fields: [
          {
            type: 'relation',
            name: 'event',
            required: true,
            collectionId: events.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            type: 'relation',
            name: 'day',
            required: true,
            collectionId: days.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { type: 'text', name: 'starts_at', required: true, pattern: TIME },
          {
            type: 'number',
            name: 'duration_minutes',
            required: true,
            onlyInt: true,
            min: 5,
            max: 1440,
          },
          { type: 'text', name: 'title', required: true, max: 100 },
          { type: 'text', name: 'place', max: 100 },
          { type: 'select', name: 'color', maxSelect: 1, values: COLORS },
          { type: 'text', name: 'responsibility', max: 200 },
          // Category columns the block covers; empty = all columns (event-wide).
          { type: 'relation', name: 'categories', collectionId: categories.id, maxSelect: 999 },
          // Public blocks are shown to coaches and on public pages; others only to staff.
          { type: 'bool', name: 'public' },
          { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
          { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX `idx_schedule_blocks_event` ON `schedule_blocks` (`event`)',
          'CREATE INDEX `idx_schedule_blocks_day` ON `schedule_blocks` (`day`)',
        ],
      })
      app.save(blocks)
    }

    // Existing rounds get their phases: maintenance if the round has a testing phase, scoring
    // always, both unplaced on the round's day.
    const phases = app.findCollectionByNameOrId('round_phases')
    for (const round of app.findRecordsByFilter('rounds', '1=1', '', 0, 0)) {
      const plan = [['scoring', round.getInt('scoring_minutes') || 1]]
      if (round.getInt('testing_minutes') > 0) {
        plan.unshift(['maintenance', round.getInt('testing_minutes')])
      }
      for (const [phase, minutes] of plan) {
        const record = new Record(phases)
        record.set('round', round.id)
        record.set('phase', phase)
        record.set('duration_minutes', minutes)
        if (phase === 'scoring') record.set('day', round.getString('day'))
        app.saveNoValidate(record)
      }
    }
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('schedule_blocks'))
    app.delete(app.findCollectionByNameOrId('round_phases'))
    const days = app.findCollectionByNameOrId('competition_days')
    days.fields.removeByName('starts_at')
    days.fields.removeByName('ends_at')
    app.save(days)
  },
)
