/// <reference path="../pb_data/types.d.ts" />

// M7-01 – M7-04: transactional email. See docs/specifications/M7-communication.md.
//
// - mail_templates: configurable subject/body per notification (admins edit, nobody creates or
//   deletes: the keys are fixed by the server, which knows the variables of each one).
// - mail_outbox: every notification is queued here first, in the same transaction as the change
//   that caused it, and delivered by the server with retries (hooks/mail.pb.js). Read-only API.
// - schedule_notices: per team, a fingerprint of the schedule the coach was last told about, so
//   only affected teams are notified of a change (internal, no API access).

const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const isManager = (e) => `(${MINE} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`

// Variables are written as {{name}}; see hooks/lib/mail.js (TEMPLATE_VARIABLES).
const p = (...lines) => lines.map((l) => `<p>${l}</p>`).join('\n')
const DEFAULT_TEMPLATES = [
  {
    key: 'registration_submitted',
    name: 'Registration received',
    subject: 'Registration received: {{team_name}}',
    body: p(
      'Hello {{coach_name}},',
      'we have received the registration of <strong>{{team_name}}</strong> for {{category_name}} at {{event_name}}. The organizers will review it and let you know.',
      '<a href="{{team_url}}">View the registration</a>',
    ),
  },
  {
    key: 'registration_approved',
    name: 'Registration approved',
    subject: 'Registration approved: {{team_name}}',
    body: p(
      'Hello {{coach_name}},',
      'the registration of <strong>{{team_name}}</strong> for {{category_name}} at {{event_name}} has been approved.',
      '{{review_note}}',
      '<a href="{{team_url}}">View the registration</a>',
    ),
  },
  {
    key: 'registration_rejected',
    name: 'Registration rejected',
    subject: 'Registration not accepted: {{team_name}}',
    body: p(
      'Hello {{coach_name}},',
      'the registration of <strong>{{team_name}}</strong> for {{category_name}} at {{event_name}} could not be accepted.',
      'Reason: {{review_note}}',
      'You can correct the registration and submit it again: <a href="{{team_url}}">open the registration</a>.',
    ),
  },
  {
    key: 'schedule_changed',
    name: 'Schedule update',
    subject: 'Schedule for {{team_name}} at {{event_name}}',
    body: [
      p('Hello {{coach_name}},', 'this is the current schedule of <strong>{{team_name}}</strong>:'),
      '{{schedule}}',
      p('{{message}}', '<a href="{{schedule_url}}">Full event schedule</a>'),
    ].join('\n'),
  },
]

migrate(
  (app) => {
    const events = app.findCollectionByNameOrId('events')
    const teams = app.findCollectionByNameOrId('teams')

    const templates = new Collection({
      type: 'base',
      name: 'mail_templates',
      listRule: `${AUTH} && ${IS_ADMIN}`,
      viewRule: `${AUTH} && ${IS_ADMIN}`,
      createRule: null,
      updateRule: `${AUTH} && ${IS_ADMIN} && (@request.body.key:isset = false || @request.body.key = key)`,
      deleteRule: null,
      fields: [
        { type: 'text', name: 'key', required: true, max: 100, pattern: '^[a-z0-9_]+$' },
        { type: 'text', name: 'name', required: true, max: 200 },
        { type: 'bool', name: 'enabled' },
        { type: 'text', name: 'subject', required: true, max: 300 },
        { type: 'text', name: 'body', required: true, max: 50000 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_mail_templates_key` ON `mail_templates` (`key`)'],
    })
    app.save(templates)
    DEFAULT_TEMPLATES.forEach((t) => {
      const record = new Record(templates)
      record.load({ ...t, enabled: true })
      app.save(record)
    })

    const outboxRead = `${AUTH} && (${IS_ADMIN} || (event != "" && ${isManager('event')}))`
    const outbox = new Collection({
      type: 'base',
      name: 'mail_outbox',
      listRule: outboxRead,
      viewRule: outboxRead,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: 'text', name: 'template', max: 100 },
        { type: 'email', name: 'to', required: true },
        { type: 'text', name: 'subject', required: true, max: 300 },
        { type: 'text', name: 'html', max: 200000 },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['pending', 'sent', 'failed'],
        },
        { type: 'number', name: 'attempts', onlyInt: true, min: 0 },
        { type: 'date', name: 'next_attempt_at' },
        { type: 'text', name: 'last_error', max: 2000 },
        { type: 'date', name: 'sent_at' },
        // Deliver right after the triggering change is committed (single messages); bulk
        // notifications are left to the delivery job.
        { type: 'bool', name: 'immediate' },
        { type: 'relation', name: 'event', collectionId: events.id, maxSelect: 1 },
        { type: 'relation', name: 'team', collectionId: teams.id, maxSelect: 1 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX `idx_mail_outbox_due` ON `mail_outbox` (`status`, `next_attempt_at`)',
        'CREATE INDEX `idx_mail_outbox_event` ON `mail_outbox` (`event`, `created`)',
      ],
    })
    app.save(outbox)

    const notices = new Collection({
      type: 'base',
      name: 'schedule_notices',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'team',
          required: true,
          collectionId: teams.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'text', name: 'fingerprint', max: 100 },
        { type: 'date', name: 'notified_at' },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_schedule_notices_team` ON `schedule_notices` (`team`)'],
    })
    app.save(notices)
  },
  (app) => {
    ;['schedule_notices', 'mail_outbox', 'mail_templates'].forEach((name) =>
      app.delete(app.findCollectionByNameOrId(name)),
    )
  },
)
