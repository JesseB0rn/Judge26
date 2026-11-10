/// <reference path="../pb_data/types.d.ts" />

// Access rules: look up only the signed-in user's own role assignments and teams.
//
// The earlier rules checked roles with `@collection.role_assignments:<alias>` and team
// ownership with `@collection.teams:own`. PocketBase joins an `@collection` reference with
// no join condition, so every alias multiplied the rows the database compared: listing
// categories joined all role assignments three times plus all teams (44 assignments and
// 32 teams meant ~2.7M combinations per category, i.e. seconds per list request).
//
// The rules below are the same rules with the same structure; only the helper bodies
// change. They reach the user's rows through back-relations of the auth record
// (`@request.auth.role_assignments_via_user`, `@request.auth.teams_via_coach`), which
// joins just those rows using the indexes on role_assignments.user and teams.coach.
//
// Two things keep the rewrite exactly as strict as before:
// - Every helper still compares `user`/`coach` with `@request.auth.id` on the same row.
//   For a user without any role the join yields one empty row, and PocketBase compares
//   missing values as "", so `role.event ?= ""` alone would match records without an
//   event (templates). The owner check fails on that empty row.
// - All helpers share one join, so a helper's conditions apply to one row (role and
//   event of the same assignment, as before). Helpers are only ever combined with `||`
//   or with conditions on the record itself, never `&&`-ed with each other, so sharing
//   the join does not change any result.
//
// `down` rebuilds the previous rules from the previous helpers.

const AUTH = '@request.auth.id != "" && @request.auth.verified = true'

function scopedHelpers() {
  const R = '@request.auth.role_assignments_via_user'
  const T = '@request.auth.teams_via_coach'
  const mine = `${R}.user ?= @request.auth.id`
  return {
    IS_ADMIN: `(${mine} && ${R}.role ?= "admin")`,
    anyRole: (e) => `(${mine} && ${R}.event ?= ${e})`,
    isManager: (e) => `(${mine} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`,
    // Head judges and managers review score sheets of their event.
    isReviewer: (e) =>
      `(${mine} && ${R}.event ?= ${e} && (${R}.role ?= "head_judge" || ${R}.role ?= "event_manager"))`,
    // Manager of any event: may see the templates (records without an event).
    TEMPLATE_MANAGER_TERMS: `${mine} && ${R}.role ?= "event_manager"`,
    hasOwnTeam: (e) => `(${T}.coach ?= @request.auth.id && ${T}.event ?= ${e})`,
  }
}

function legacyHelpers() {
  const ra = (alias) => `@collection.role_assignments:${alias}`
  return {
    IS_ADMIN: `(${ra('adm')}.user ?= @request.auth.id && ${ra('adm')}.role ?= "admin")`,
    anyRole: (e) => `(${ra('any')}.user ?= @request.auth.id && ${ra('any')}.event ?= ${e})`,
    isManager: (e) =>
      `(${ra('mgr')}.user ?= @request.auth.id && ${ra('mgr')}.event ?= ${e} && ${ra('mgr')}.role ?= "event_manager")`,
    isReviewer: (e) =>
      `(${ra('rev')}.user ?= @request.auth.id && ${ra('rev')}.event ?= ${e} && (${ra('rev')}.role ?= "head_judge" || ${ra('rev')}.role ?= "event_manager"))`,
    TEMPLATE_MANAGER_TERMS: `${ra('tpl')}.user ?= @request.auth.id && ${ra('tpl')}.role ?= "event_manager"`,
    hasOwnTeam: (e) =>
      `(@collection.teams:own.event ?= ${e} && @collection.teams:own.coach ?= @request.auth.id)`,
  }
}

/** All rules that depend on roles, keyed by collection. Rules not listed stay as they are. */
function buildRules(h) {
  const { IS_ADMIN, anyRole, isManager, isReviewer, TEMPLATE_MANAGER_TERMS, hasOwnTeam } = h
  const TEMPLATE_MANAGER = `(${TEMPLATE_MANAGER_TERMS})`
  const unchanged = (field) =>
    `(@request.body.${field}:isset = false || @request.body.${field} = ${field})`
  const notSet = (field) => `@request.body.${field}:isset = false`
  // Published events are visible to all verified users; archived events only to staff
  // and to coaches with teams in them (M1-T12).
  const canSeeEventTerms = (e, status) =>
    `${anyRole(e)} || ${status} = "published" || (${status} = "archived" && ${hasOwnTeam(e)})`
  const canSeeEvent = (e, status) => `(${canSeeEventTerms(e, status)})`
  const canManageEvent = (e) => `(${IS_ADMIN} || ${isManager(e)})`
  const REGISTRATION_OPEN =
    'event.status = "published" && (event.registration_opens_at = "" || event.registration_opens_at <= @now) && (event.registration_closes_at = "" || event.registration_closes_at > @now)'

  const rules = {}
  const set = (name, list, create, update, del) => {
    rules[name] = {
      listRule: list,
      viewRule: list,
      createRule: create,
      updateRule: update,
      deleteRule: del,
    }
  }

  rules.users = {
    listRule: `id = @request.auth.id || (${AUTH} && ${IS_ADMIN})`,
    viewRule: `id = @request.auth.id || (${AUTH} && ${IS_ADMIN})`,
  }

  {
    const admin = `${AUTH} && ${IS_ADMIN}`
    set(
      'role_assignments',
      `${AUTH} && (user = @request.auth.id || ${IS_ADMIN})`,
      admin,
      admin,
      admin,
    )
  }

  set(
    'events',
    `${AUTH} && (${IS_ADMIN} || ${canSeeEventTerms('id', 'status')})`,
    `${AUTH} && ${IS_ADMIN}`,
    `${AUTH} && ${canManageEvent('id')}`,
    `${AUTH} && ${IS_ADMIN}`,
  )

  {
    const manage = `${AUTH} && ${canManageEvent('event')} && event.status != "archived"`
    set(
      'competition_days',
      `${AUTH} && (${IS_ADMIN} || ${canSeeEventTerms('event', 'event.status')})`,
      manage,
      `${manage} && ${unchanged('event')}`,
      manage,
    )
  }

  {
    const manage = `${AUTH} && (${IS_ADMIN} || (event != "" && ${isManager('event')} && event.status != "archived"))`
    set(
      'categories',
      `${AUTH} && (${IS_ADMIN} || (event = "" && ${TEMPLATE_MANAGER_TERMS}) || (event != "" && (${IS_ADMIN} || ${canSeeEventTerms('event', 'event.status')})))`,
      manage,
      `${manage} && ${unchanged('event')}`,
      manage,
    )
  }

  {
    const coachOwns = 'coach = @request.auth.id'
    const reviewFieldsUnset = ['review_note', 'reviewed_by', 'reviewed_at', 'submitted_at']
      .map(notSet)
      .join(' && ')
    set(
      'teams',
      `${AUTH} && (${coachOwns} || ${IS_ADMIN} || ${anyRole('event')})`,
      `${AUTH} && (${canManageEvent('event')} || (@request.body.coach = @request.auth.id && ${REGISTRATION_OPEN} && (@request.body.status = "draft" || @request.body.status = "submitted") && ${reviewFieldsUnset}))`,
      `${AUTH} && (${canManageEvent('event')} || (${coachOwns} && ${REGISTRATION_OPEN} && (status = "draft" || status = "rejected") && (@request.body.status:isset = false || @request.body.status = "draft" || @request.body.status = "submitted") && ${unchanged('event')} && ${unchanged('coach')} && ${reviewFieldsUnset}))`,
      `${AUTH} && (${IS_ADMIN} || (${coachOwns} && status = "draft"))`,
    )
  }

  // Records of a category: visible like the category, managed like the category.
  {
    const E = 'category.event'
    const list = `${AUTH} && (${IS_ADMIN} || (${E} = "" && ${TEMPLATE_MANAGER}) || (${E} != "" && ${canSeeEvent(E, `${E}.status`)}))`
    const manage = `${AUTH} && (${IS_ADMIN} || (${E} != "" && ${isManager(E)} && ${E}.status != "archived"))`
    for (const name of ['rounds', 'game_rules']) {
      set(name, list, manage, `${manage} && ${unchanged('category')}`, manage)
    }
    // Only drafts change; versions are assigned by the server.
    set(
      'rulesets',
      list,
      `${manage} && ${notSet('version')}`,
      `${manage} && status = "draft" && ${unchanged('category')} && ${notSet('version')} && ${unchanged('game_rule')}`,
      `${manage} && status = "draft"`,
    )
    // Snapshots: created only by the server route, never changed (M3-17).
    set(
      'ranking_snapshots',
      `${AUTH} && (${IS_ADMIN} || ${anyRole(E)})`,
      null,
      null,
      `${AUTH} && ${IS_ADMIN}`,
    )
  }

  // Games: event staff and the team's coach can read; managers record results.
  {
    const E = 'round.category.event'
    const manage = `${AUTH} && ${canManageEvent(E)} && ${E}.status != "archived"`
    set(
      'games',
      `${AUTH} && (team.coach = @request.auth.id || ${IS_ADMIN} || ${anyRole(E)})`,
      manage,
      manage,
      manage,
    )
  }

  {
    const manage = `${AUTH} && (${IS_ADMIN} || (event != "" && ${isManager('event')} && event.status != "archived"))`
    set(
      'tables',
      `${AUTH} && (${IS_ADMIN} || (event != "" && ${canSeeEvent('event', 'event.status')}))`,
      manage,
      `${manage} && ${unchanged('event')}`,
      manage,
    )
  }

  // Score sheets and their audit trail: written only by the judging routes.
  for (const name of ['score_sheets', 'score_audit']) {
    set(
      name,
      `${AUTH} && (${IS_ADMIN} || ${isReviewer('game.team.event')} || game.table.judge = @request.auth.id)`,
      null,
      null,
      null,
    )
  }

  return rules
}

function apply(app, rules) {
  for (const [name, collectionRules] of Object.entries(rules)) {
    const collection = app.findCollectionByNameOrId(name)
    for (const [key, rule] of Object.entries(collectionRules)) collection[key] = rule
    app.save(collection)
  }
}

migrate(
  (app) => apply(app, buildRules(scopedHelpers())),
  (app) => apply(app, buildRules(legacyHelpers())),
)
