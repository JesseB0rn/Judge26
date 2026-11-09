/// <reference path="../pb_data/types.d.ts" />

// M1: identity, roles, events, competition days, categories and teams.
// Access rules are documented in docs/specifications/M1-permissions.md.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    // --- Collections (rules are added below once all collections exist) ---

    const events = new Collection({
      type: 'base',
      name: 'events',
      fields: [
        { type: 'text', name: 'name', required: true, max: 200 },
        { type: 'number', name: 'season', required: true, onlyInt: true, min: 2000, max: 2100 },
        { type: 'text', name: 'venue', max: 200 },
        { type: 'text', name: 'description', max: 5000 },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['draft', 'published', 'archived'],
        },
        { type: 'date', name: 'registration_opens_at' },
        { type: 'date', name: 'registration_closes_at' },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX `idx_events_status` ON `events` (`status`)'],
    })
    app.save(events)

    const roleAssignments = new Collection({
      type: 'base',
      name: 'role_assignments',
      fields: [
        {
          type: 'relation',
          name: 'user',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'select',
          name: 'role',
          required: true,
          maxSelect: 1,
          values: ['admin', 'event_manager', 'head_judge', 'judge'],
        },
        {
          type: 'relation',
          name: 'event',
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_role_assignments_unique` ON `role_assignments` (`user`, `role`, `event`)',
        'CREATE INDEX `idx_role_assignments_event` ON `role_assignments` (`event`)',
      ],
    })
    app.save(roleAssignments)

    const days = new Collection({
      type: 'base',
      name: 'competition_days',
      fields: [
        {
          type: 'relation',
          name: 'event',
          required: true,
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        // Calendar date (YYYY-MM-DD) in the event's local time; no time zone conversion.
        { type: 'text', name: 'date', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        { type: 'text', name: 'label', max: 100 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_competition_days_unique` ON `competition_days` (`event`, `date`)',
      ],
    })
    app.save(days)

    const categories = new Collection({
      type: 'base',
      name: 'categories',
      fields: [
        // Empty event = reusable template in the category library.
        {
          type: 'relation',
          name: 'event',
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'text', name: 'name', required: true, max: 200 },
        { type: 'text', name: 'code', required: true, max: 50, pattern: '^[A-Za-z0-9_-]+$' },
        { type: 'text', name: 'description', max: 5000 },
        { type: 'number', name: 'min_age', onlyInt: true, min: 0, max: 100 },
        { type: 'number', name: 'max_age', onlyInt: true, min: 0, max: 100 },
        { type: 'number', name: 'min_team_size', onlyInt: true, min: 1, max: 20 },
        { type: 'number', name: 'max_team_size', onlyInt: true, min: 1, max: 20 },
        { type: 'number', name: 'max_teams', onlyInt: true, min: 0 },
        // Category configuration (scoring rules etc. from M2). Copied, never shared.
        { type: 'json', name: 'settings', maxSize: 2000000 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_categories_event_code` ON `categories` (`event`, `code`)',
      ],
    })
    app.save(categories)
    // Provenance of copied categories (self relation, added after the collection exists).
    categories.fields.add(
      new RelationField({ name: 'source', collectionId: categories.id, maxSelect: 1 }),
    )
    app.save(categories)

    const teams = new Collection({
      type: 'base',
      name: 'teams',
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
          name: 'category',
          required: true,
          collectionId: categories.id,
          maxSelect: 1,
        },
        { type: 'text', name: 'name', required: true, max: 100 },
        { type: 'text', name: 'organization', max: 200 },
        { type: 'text', name: 'country', max: 100 },
        // Account owning the registration. Imported teams may not have one yet.
        { type: 'relation', name: 'coach', collectionId: users.id, maxSelect: 1 },
        { type: 'text', name: 'coach_name', max: 200 },
        { type: 'email', name: 'coach_email', required: true },
        // [{ first_name, last_name, birth_year }]
        { type: 'json', name: 'members', maxSize: 100000 },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['draft', 'submitted', 'approved', 'rejected', 'withdrawn'],
        },
        { type: 'text', name: 'review_note', max: 2000 },
        { type: 'date', name: 'submitted_at' },
        { type: 'date', name: 'reviewed_at' },
        { type: 'relation', name: 'reviewed_by', collectionId: users.id, maxSelect: 1 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_teams_category_name` ON `teams` (`category`, `name` COLLATE NOCASE)',
        'CREATE INDEX `idx_teams_event_status` ON `teams` (`event`, `status`)',
        'CREATE INDEX `idx_teams_coach` ON `teams` (`coach`)',
      ],
    })
    app.save(teams)

    // --- Access rules ---

    const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
    const IS_ADMIN =
      '(@collection.role_assignments:adm.user ?= @request.auth.id && @collection.role_assignments:adm.role ?= "admin")'
    // Any role in the given event.
    const anyRole = (eventExpr) =>
      `(@collection.role_assignments:any.user ?= @request.auth.id && @collection.role_assignments:any.event ?= ${eventExpr})`
    const isManager = (eventExpr) =>
      `(@collection.role_assignments:mgr.user ?= @request.auth.id && @collection.role_assignments:mgr.event ?= ${eventExpr} && @collection.role_assignments:mgr.role ?= "event_manager")`
    const hasOwnTeam = (eventExpr) =>
      `(@collection.teams:own.event ?= ${eventExpr} && @collection.teams:own.coach ?= @request.auth.id)`
    // Published events are visible to all verified users; archived events only
    // to staff and to coaches with teams in them (M1-T12).
    const canSeeEvent = (eventExpr, statusExpr) =>
      `(${IS_ADMIN} || ${anyRole(eventExpr)} || ${statusExpr} = "published" || (${statusExpr} = "archived" && ${hasOwnTeam(eventExpr)}))`
    const canManageEvent = (eventExpr) => `(${IS_ADMIN} || ${isManager(eventExpr)})`
    const REGISTRATION_OPEN =
      'event.status = "published" && (event.registration_opens_at = "" || event.registration_opens_at <= @now) && (event.registration_closes_at = "" || event.registration_closes_at > @now)'
    const unchanged = (field) =>
      `(@request.body.${field}:isset = false || @request.body.${field} = ${field})`
    const notSet = (field) => `@request.body.${field}:isset = false`

    users.listRule = `id = @request.auth.id || (${AUTH} && ${IS_ADMIN})`
    users.viewRule = users.listRule
    users.verificationTemplate.body = [
      '<p>Hello,</p>',
      '<p>Thank you for registering with {APP_NAME}. Please confirm your email address:</p>',
      '<p><a class="btn" href="{APP_URL}/auth/verify-email?token={TOKEN}" target="_blank" rel="noopener">Verify email</a></p>',
      '<p>Thanks,<br/>{APP_NAME} team</p>',
    ].join('\n')
    users.resetPasswordTemplate.body = [
      '<p>Hello,</p>',
      '<p>Click the button below to choose a new password.</p>',
      '<p><a class="btn" href="{APP_URL}/auth/reset-password?token={TOKEN}" target="_blank" rel="noopener">Reset password</a></p>',
      "<p><i>If you didn't ask to reset your password, you can ignore this email.</i></p>",
      '<p>Thanks,<br/>{APP_NAME} team</p>',
    ].join('\n')
    app.save(users)

    roleAssignments.listRule = `${AUTH} && (user = @request.auth.id || ${IS_ADMIN})`
    roleAssignments.viewRule = roleAssignments.listRule
    roleAssignments.createRule = `${AUTH} && ${IS_ADMIN}`
    roleAssignments.updateRule = `${AUTH} && ${IS_ADMIN}`
    roleAssignments.deleteRule = `${AUTH} && ${IS_ADMIN}`
    app.save(roleAssignments)

    events.listRule = `${AUTH} && ${canSeeEvent('id', 'status')}`
    events.viewRule = events.listRule
    events.createRule = `${AUTH} && ${IS_ADMIN}`
    events.updateRule = `${AUTH} && ${canManageEvent('id')}`
    events.deleteRule = `${AUTH} && ${IS_ADMIN}`
    app.save(events)

    days.listRule = `${AUTH} && ${canSeeEvent('event', 'event.status')}`
    days.viewRule = days.listRule
    days.createRule = `${AUTH} && ${canManageEvent('event')} && event.status != "archived"`
    days.updateRule = `${days.createRule} && ${unchanged('event')}`
    days.deleteRule = days.createRule
    app.save(days)

    const isTemplate = 'event = ""'
    categories.listRule = `${AUTH} && (${IS_ADMIN} || (${isTemplate} && @collection.role_assignments:tpl.user ?= @request.auth.id && @collection.role_assignments:tpl.role ?= "event_manager") || (event != "" && ${canSeeEvent('event', 'event.status')}))`
    categories.viewRule = categories.listRule
    categories.createRule = `${AUTH} && (${IS_ADMIN} || (event != "" && ${isManager('event')} && event.status != "archived"))`
    categories.updateRule = `${categories.createRule} && ${unchanged('event')}`
    categories.deleteRule = categories.createRule
    app.save(categories)

    const coachOwns = 'coach = @request.auth.id'
    teams.listRule = `${AUTH} && (${coachOwns} || ${IS_ADMIN} || ${anyRole('event')})`
    teams.viewRule = teams.listRule
    teams.createRule = `${AUTH} && (${canManageEvent('event')} || (@request.body.coach = @request.auth.id && ${REGISTRATION_OPEN} && (@request.body.status = "draft" || @request.body.status = "submitted") && ${notSet('review_note')} && ${notSet('reviewed_by')} && ${notSet('reviewed_at')} && ${notSet('submitted_at')}))`
    teams.updateRule = `${AUTH} && (${canManageEvent('event')} || (${coachOwns} && ${REGISTRATION_OPEN} && (status = "draft" || status = "rejected") && (@request.body.status:isset = false || @request.body.status = "draft" || @request.body.status = "submitted") && ${unchanged('event')} && ${unchanged('coach')} && ${notSet('review_note')} && ${notSet('reviewed_by')} && ${notSet('reviewed_at')} && ${notSet('submitted_at')}))`
    teams.deleteRule = `${AUTH} && (${IS_ADMIN} || (${coachOwns} && status = "draft"))`
    app.save(teams)

    // Team import (M1-12) uses the transactional batch API.
    const settings = app.settings()
    settings.batch.enabled = true
    settings.batch.maxRequests = 500
    settings.batch.timeout = 30
    settings.meta.appName = 'Judge26'
    app.save(settings)
  },
  (app) => {
    for (const name of ['teams', 'categories', 'competition_days', 'role_assignments', 'events']) {
      app.delete(app.findCollectionByNameOrId(name))
    }
    const users = app.findCollectionByNameOrId('users')
    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    app.save(users)
  },
)
