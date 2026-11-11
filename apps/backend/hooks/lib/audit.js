/// <reference path="../../pb_data/types.d.ts" />

// M7-08: audit log. See docs/specifications/M7-audit-backup-security.md.
//
// Changes through the record API of the collections below are logged by request hooks
// (hooks/audit.pb.js), so the acting user and IP are known. Server-side actions (custom routes,
// backups) call `log()` directly. Logging never fails the action it describes.

/** Collections whose API changes are administrative actions. */
const AUDITED = [
  'events',
  'competition_days',
  'categories',
  'teams',
  'team_documents',
  'role_assignments',
  'game_rules',
  'rulesets',
  'rounds',
  'round_phases',
  'schedule_blocks',
  'schedule_columns',
  'tables',
  'games',
  'ranking_snapshots',
  'mail_templates',
]

/** Never stored. */
const SECRET = ['password', 'passwordConfirm', 'tokenKey']
/** Personal or bulky values: only the fact that they changed is stored. */
const REDACTED = [
  'members',
  'values',
  'definition',
  'ranking',
  'config',
  'inputs',
  'result',
  'body',
]
const MAX_TEXT = 300

function findById(app, collection, id) {
  if (!id) return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

function categoryEvent(app, id) {
  const category = findById(app, 'categories', id)
  return category ? category.getString('event') : ''
}

/** Event a record belongs to, or "" (platform-wide, e.g. templates and admin roles). */
function eventOf(app, collection, record) {
  switch (collection) {
    case 'events':
      return record.id
    case 'rounds':
    case 'rulesets':
    case 'game_rules':
    case 'ranking_snapshots':
      return categoryEvent(app, record.getString('category'))
    case 'round_phases': {
      const round = findById(app, 'rounds', record.getString('round'))
      return round ? categoryEvent(app, round.getString('category')) : ''
    }
    case 'games':
    case 'team_documents': {
      const team = findById(app, 'teams', record.getString('team'))
      return team ? team.getString('event') : ''
    }
    default:
      return record.getString('event')
  }
}

/** A short, human name for a record. */
function nameOf(record) {
  for (const field of ['name', 'title', 'key', 'label', 'date']) {
    const value = record.getString(field)
    if (value) return value
  }
  return record.id
}

/** Fields worth logging, with their types: no ids, timestamps or secrets. */
function auditedFields(record) {
  const fields = record.collection().fields
  const result = []
  for (let i = 0; i < fields.length; i++) {
    const type = fields[i].type()
    const name = fields[i].getName()
    if (type === 'autodate' || type === 'password' || name === 'id') continue
    if (SECRET.indexOf(name) !== -1) continue
    result.push({ name, type })
  }
  return result
}

/** A comparable, JSON-friendly value of a field. */
function plain(record, field) {
  let value
  switch (field.type) {
    case 'number':
      value = record.getFloat(field.name)
      break
    case 'bool':
      value = record.getBool(field.name)
      break
    case 'relation':
    case 'select':
    case 'file': {
      const list = record.getStringSlice(field.name)
      value = list.length > 1 ? list.join(', ') : list[0] || ''
      break
    }
    default:
      value = record.getString(field.name)
  }
  if (typeof value === 'string' && value.length > MAX_TEXT) return `${value.slice(0, MAX_TEXT)}…`
  return value
}

/** { field: [before, after] } of the changed fields. */
function diff(before, after) {
  const changes = {}
  auditedFields(after).forEach((field) => {
    const a = before ? plain(before, field) : null
    const b = plain(after, field)
    if (a === b) return
    changes[field.name] = REDACTED.indexOf(field.name) !== -1 ? ['[changed]', '[changed]'] : [a, b]
  })
  return changes
}

/** { field: value } of the non-empty fields (creates and deletes). */
function values(record) {
  const result = {}
  auditedFields(record).forEach((field) => {
    const value = plain(record, field)
    if (value === '' || value === 0 || value === false || value === 'null' || value === '[]') return
    result[field.name] = REDACTED.indexOf(field.name) !== -1 ? '[set]' : value
  })
  return result
}

function actorOf(auth) {
  if (!auth) return { actor: '', label: 'system' }
  if (auth.isSuperuser()) return { actor: '', label: `superuser ${auth.email()}` }
  return { actor: auth.id, label: auth.email() }
}

function requestIp(e) {
  try {
    return e.realIP()
  } catch (_) {
    return ''
  }
}

/**
 * Appends an entry. `entry`: { auth, action, collection, record, event, summary, changes, ip }.
 * Never throws.
 */
function log(app, entry) {
  try {
    const record = new Record(app.findCollectionByNameOrId('audit_log'))
    const who = actorOf(entry.auth)
    record.set('actor', who.actor)
    record.set('actor_label', who.label)
    record.set('action', entry.action)
    record.set('collection', entry.collection || '')
    record.set('record', entry.record || '')
    record.set('event', entry.event || '')
    record.set('summary', String(entry.summary || '').slice(0, 1000))
    record.set('changes', entry.changes || null)
    record.set('ip', entry.ip || '')
    app.save(record)
  } catch (err) {
    app.logger().error('Audit log write failed', 'action', entry.action, 'error', String(err))
  }
}

const VERBS = { create: 'Created', update: 'Updated', delete: 'Deleted' }
const SINGULAR = {
  events: 'event',
  competition_days: 'competition day',
  categories: 'category',
  teams: 'team',
  team_documents: 'team document',
  role_assignments: 'role',
  game_rules: 'game',
  rulesets: 'ruleset',
  rounds: 'round',
  round_phases: 'round phase',
  schedule_blocks: 'schedule block',
  schedule_columns: 'schedule column',
  tables: 'table',
  games: 'game result',
  ranking_snapshots: 'ranking snapshot',
  mail_templates: 'email template',
}

function describe(action, collection, record, changes) {
  const what = `${VERBS[action]} ${SINGULAR[collection] || collection} “${nameOf(record)}”`
  if (action !== 'update') return what
  const fields = Object.keys(changes)
  const status = changes.status
  if (status) return `${what}: status ${status[0] || '–'} → ${status[1] || '–'}`
  return fields.length ? `${what}: ${fields.join(', ')}` : what
}

/** Logs a record API change. `before` is the stored record (update, delete) or null. */
function logRecordChange(e, action, before) {
  const collection = e.record.collection().name
  const record = action === 'delete' ? before : e.record
  const changes =
    action === 'update' ? diff(before, e.record) : values(action === 'delete' ? before : e.record)
  if (action === 'update' && !Object.keys(changes).length) return
  log(e.app, {
    auth: e.auth,
    action,
    collection,
    record: record.id,
    event: eventOf(e.app, collection, record),
    summary: describe(action, collection, record, changes),
    changes,
    ip: requestIp(e),
  })
}

// ---------------------------------------------------------------------------
// Backup restores (M7-10): the restore replaces the database, so the entry is written after the
// restart from a marker kept outside the data directory.
// ---------------------------------------------------------------------------

function restoreMarkerPath(app) {
  const id = $security.sha256(app.dataDir()).slice(0, 16)
  return `${$os.tempDir()}/judge26-restore-${id}.json`
}

function markRestore(app, name) {
  try {
    $os.writeFile(
      restoreMarkerPath(app),
      JSON.stringify({ name, requested_at: new Date().toISOString() }),
      0o600,
    )
  } catch (err) {
    app.logger().error('Could not write the restore marker', 'error', String(err))
  }
}

/** On bootstrap: logs a completed restore, if one was requested before the restart. */
function logCompletedRestore(app) {
  const path = restoreMarkerPath(app)
  let marker
  try {
    marker = JSON.parse(toString($os.readFile(path)))
  } catch (_) {
    return
  }
  try {
    $os.remove(path)
  } catch (_) {
    // ignore
  }
  log(app, {
    auth: null,
    action: 'backup.restore',
    summary: `Restored backup “${marker.name}” (requested ${marker.requested_at})`,
    changes: { name: marker.name },
  })
}

module.exports = {
  AUDITED,
  log,
  logRecordChange,
  eventOf,
  requestIp,
  markRestore,
  logCompletedRestore,
}
