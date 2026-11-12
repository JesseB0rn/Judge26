/// <reference path="../pb_data/types.d.ts" />

// M8-A: retire the coach role. Teams are imported by event managers; nobody owns a team any
// more, so no access rule may grant anything through `teams.coach`.
//
// - Every rule loses its coach terms: reading one's own teams, games and team documents;
//   seeing archived events (and their records) because one owns a team in them; and the
//   self-service create/update/delete branches of `teams` (M1-10). The remaining terms are
//   unchanged, so staff and public access stay exactly as before.
// - `teams.coach_email` becomes optional: the coach fields stay in the schema as the team's
//   optional contact, who receives schedule emails when an address is set.
// - The registration-status emails (M7-03) are disabled: there is no registration workflow.
// - The schedule email's `{{coach_name}}` placeholder becomes `{{contact_name}}` (the retired
//   registration templates keep theirs).
//
// `up` stores the previous rules and the disabled templates in app_settings, so `down` restores
// them exactly.

const SETTING = 'migration.m8_coach_rules'
const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const isManager = (e) => `(${MINE} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`
const CAN_MANAGE = `(${IS_ADMIN} || ${isManager('event')})`
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']
const OWN_TEAM =
  '\\(@request\\.auth\\.teams_via_coach\\.coach \\?= @request\\.auth\\.id && @request\\.auth\\.teams_via_coach\\.event \\?= [a-z.]+\\)'
const REGISTRATION_TEMPLATES = [
  'registration_submitted',
  'registration_approved',
  'registration_rejected',
]

/** A rule as a primitive string, or null ("superusers only"). The JSVM boxes rule strings. */
function ruleText(value) {
  return value === null || value === undefined ? null : String(value)
}

/** The rule without its coach terms. */
function withoutCoach(rule) {
  return rule
    .replace(
      new RegExp(` \\|\\| \\(((?:[a-z]+\\.)*)status = "archived" && ${OWN_TEAM}\\)`, 'g'),
      '',
    )
    .replace(/\((team\.)?coach = @request\.auth\.id \|\| /g, '(')
}

function teamsRules(previous) {
  // Only staff of the event read teams; only its managers (and admins) change them.
  return {
    listRule: withoutCoach(previous.listRule),
    viewRule: withoutCoach(previous.viewRule),
    createRule: `${AUTH} && ${CAN_MANAGE}`,
    updateRule: `${AUTH} && ${CAN_MANAGE}`,
    deleteRule: `${AUTH} && ${IS_ADMIN}`,
  }
}

function setTemplates(app, apply) {
  for (const template of app.findAllRecords('mail_templates')) {
    if (apply(template)) app.save(template)
  }
}

migrate(
  (app) => {
    const saved = {}
    for (const collection of app.findAllCollections()) {
      const previous = {}
      let touched = false
      for (const key of RULES) {
        previous[key] = ruleText(collection[key])
        if (previous[key] !== null && previous[key].includes('coach')) touched = true
      }
      if (!touched) continue
      saved[collection.name] = previous
      const next =
        collection.name === 'teams'
          ? teamsRules(previous)
          : Object.fromEntries(
              RULES.map((key) => [
                key,
                previous[key] === null ? null : withoutCoach(previous[key]),
              ]),
            )
      for (const key of RULES) {
        if (next[key] !== null && next[key].includes('coach')) {
          throw new Error(`${collection.name}.${key} still refers to coaches: ${next[key]}`)
        }
        collection[key] = next[key]
      }
      app.save(collection)
    }

    const teams = app.findCollectionByNameOrId('teams')
    teams.fields.getByName('coach_email').required = false
    app.save(teams)

    const disabled = []
    setTemplates(app, (template) => {
      let changed = false
      if (
        REGISTRATION_TEMPLATES.includes(template.getString('key')) &&
        template.getBool('enabled')
      ) {
        template.set('enabled', false)
        disabled.push(template.id)
        changed = true
      }
      if (template.getString('key') !== 'schedule_changed') return changed
      for (const field of ['subject', 'body']) {
        const value = template.getString(field)
        const next = value.replace(/\{\{\s*coach_name\s*\}\}/g, '{{contact_name}}')
        if (next !== value) {
          template.set(field, next)
          changed = true
        }
      }
      return changed
    })

    const record = new Record(app.findCollectionByNameOrId('app_settings'))
    record.set('key', SETTING)
    record.set('value', { rules: saved, disabled })
    record.set(
      'description',
      'Access rules and templates before the coach role was retired (M8-A).',
    )
    app.save(record)
  },
  (app) => {
    const record = app.findFirstRecordByData('app_settings', 'key', SETTING)
    const { rules: saved, disabled } = JSON.parse(record.getString('value'))
    for (const [name, rules] of Object.entries(saved)) {
      const collection = app.findCollectionByNameOrId(name)
      for (const key of RULES) collection[key] = rules[key]
      app.save(collection)
    }
    app.delete(record)

    const teams = app.findCollectionByNameOrId('teams')
    teams.fields.getByName('coach_email').required = true
    app.save(teams)

    setTemplates(app, (template) => {
      let changed = false
      if (disabled.includes(template.id)) {
        template.set('enabled', true)
        changed = true
      }
      if (template.getString('key') !== 'schedule_changed') return changed
      for (const field of ['subject', 'body']) {
        const value = template.getString(field)
        const next = value.replace(/\{\{\s*contact_name\s*\}\}/g, '{{coach_name}}')
        if (next !== value) {
          template.set(field, next)
          changed = true
        }
      }
      return changed
    })
  },
)
