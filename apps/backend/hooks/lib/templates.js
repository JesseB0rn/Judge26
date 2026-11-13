/// <reference path="../../pb_data/types.d.ts" />

// M8-D: event templates (M8-21 – M8-23) and the setup checklist (M8-20).
// See docs/specifications/M8-event-setup.md.
//
// A template file is plain JSON:
//
//   { format: "judge26.event-template", version: 1, name, description, exported_at, source,
//     event:      { venue, description },
//     days:       [{ offset, label, starts_at, ends_at }]           offset = days after the first day
//     categories: [{ code, name, description, min_age, max_age, min_team_size, max_team_size,
//                    max_teams, judges_per_table, settings, ranking,
//                    game_rules: [{ key, name, description, position, ruleset: { definition, notes } | null }],
//                    rounds:     [{ key, name, position, game_rule, testing_minutes, scoring_minutes,
//                                   phases: [{ phase, day, starts_at, duration_minutes }] }] }],
//     tables:     [{ name, position, active, categories: [code] }],
//     columns:    [{ name, position, public }],
//     blocks:     [{ day, starts_at, duration_minutes, title, place, color, responsibility,
//                    public, categories: [code], columns: [name] }] }
//
// Days are referenced by offset, categories by code, game rules by key and columns by name, so
// the file has no record ids and works on any installation. Rulesets are copied (the active
// version's definition), never referenced. Teams, judges, games and scores are never included.

const FORMAT = 'judge26.event-template'
const VERSION = 1
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const CODE = /^[A-Za-z0-9_-]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PHASES = ['maintenance', 'check', 'scoring']
const COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink']
const MAX_DAYS = 31

// --- Errors -------------------------------------------------------------------

/** A 400 with `data._error = { code, message, params }`, translated by the web app. */
function templateError(code, message, params) {
  let error = new ValidationError(code, message)
  if (params) {
    try {
      error = error.setParams(params)
    } catch (_) {
      // older PocketBase without params: the message still names the problem
    }
  }
  return new BadRequestError(message, { _error: error })
}

function invalid(path, detail) {
  return templateError(
    'template_invalid',
    `The template is not valid at “${path}”${detail ? `: ${detail}` : ''}.`,
    { path },
  )
}

// --- Helpers ------------------------------------------------------------------

function findById(app, collection, id) {
  if (!id) return null
  try {
    return app.findRecordById(collection, id)
  } catch (_) {
    return null
  }
}

function list(app, collection, filter, sort, params) {
  return app.findRecordsByFilter(collection, filter, sort, 0, 0, params)
}

function json(record, field) {
  const raw = record.getString(field)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

function dayNumber(date) {
  return Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86400000)
}

function dateOf(number) {
  return new Date(number * 86400000).toISOString().slice(0, 10)
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// --- Export (M8-21) -------------------------------------------------------------

/** The template of an event: its setup without people, games or scores. */
function exportEvent(app, eventId, meta) {
  const rulesets = require(`${__hooks}/lib/rulesets.js`)
  const event = app.findRecordById('events', eventId)
  const params = { e: eventId }
  const days = list(app, 'competition_days', 'event = {:e}', 'date', params)
  const first = days.length ? dayNumber(days[0].getString('date')) : 0
  const offsetOf = {}
  days.forEach((d) => (offsetOf[d.id] = dayNumber(d.getString('date')) - first))
  const dayRef = (id) => (id && id in offsetOf ? offsetOf[id] : null)

  const categories = list(app, 'categories', 'event = {:e}', 'code', params)
  const codeOf = {}
  categories.forEach((c) => (codeOf[c.id] = c.getString('code')))
  const codes = (ids) => ids.filter((id) => id in codeOf).map((id) => codeOf[id])

  const columns = list(app, 'schedule_columns', 'event = {:e}', 'position,name', params)
  const columnName = {}
  columns.forEach((c) => (columnName[c.id] = c.getString('name')))

  return {
    format: FORMAT,
    version: VERSION,
    name: (meta && meta.name) || event.getString('name'),
    description: (meta && meta.description) || '',
    exported_at: new Date().toISOString(),
    source: { event: event.getString('name'), season: event.getInt('season') },
    event: {
      venue: event.getString('venue'),
      description: event.getString('description'),
    },
    days: days.map((d) => ({
      offset: offsetOf[d.id],
      label: d.getString('label'),
      starts_at: d.getString('starts_at'),
      ends_at: d.getString('ends_at'),
    })),
    categories: categories.map((c) => {
      const ruleKey = {}
      const gameRules = rulesets.gameRules(app, c.id).map((r) => {
        ruleKey[r.id] = r.getString('key')
        const active = rulesets.activeRuleset(app, r.id)
        return {
          key: r.getString('key'),
          name: r.getString('name'),
          description: r.getString('description'),
          position: r.getInt('position'),
          ruleset: active
            ? {
                definition: json(active, 'definition'),
                notes: active.getString('notes'),
                version: active.getInt('version'),
              }
            : null,
        }
      })
      const rounds = list(app, 'rounds', 'category = {:c}', 'position,key', { c: c.id })
      return {
        code: c.getString('code'),
        name: c.getString('name'),
        description: c.getString('description'),
        min_age: c.getInt('min_age'),
        max_age: c.getInt('max_age'),
        min_team_size: c.getInt('min_team_size'),
        max_team_size: c.getInt('max_team_size'),
        max_teams: c.getInt('max_teams'),
        judges_per_table: c.getInt('judges_per_table'),
        settings: json(c, 'settings'),
        ranking: json(c, 'ranking'),
        game_rules: gameRules,
        rounds: rounds.map((r) => ({
          key: r.getString('key'),
          name: r.getString('name'),
          position: r.getInt('position'),
          game_rule: ruleKey[r.getString('game_rule')] || '',
          testing_minutes: r.getInt('testing_minutes'),
          scoring_minutes: r.getInt('scoring_minutes'),
          phases: list(app, 'round_phases', 'round = {:r}', '', { r: r.id })
            .sort(
              (a, b) => PHASES.indexOf(a.getString('phase')) - PHASES.indexOf(b.getString('phase')),
            )
            .map((p) => ({
              phase: p.getString('phase'),
              day: dayRef(p.getString('day')),
              starts_at: p.getString('starts_at'),
              duration_minutes: p.getInt('duration_minutes'),
            })),
        })),
      }
    }),
    tables: list(app, 'tables', 'event = {:e}', 'position,name', params).map((t) => ({
      name: t.getString('name'),
      position: t.getInt('position'),
      active: t.getBool('active'),
      categories: codes(t.getStringSlice('categories')),
    })),
    columns: columns.map((c) => ({
      name: c.getString('name'),
      position: c.getInt('position'),
      public: c.getBool('public'),
    })),
    blocks: list(app, 'schedule_blocks', 'event = {:e}', 'starts_at', params)
      .filter((b) => dayRef(b.getString('day')) !== null)
      .map((b) => ({
        day: dayRef(b.getString('day')),
        starts_at: b.getString('starts_at'),
        duration_minutes: b.getInt('duration_minutes'),
        title: b.getString('title'),
        place: b.getString('place'),
        color: b.getString('color'),
        responsibility: b.getString('responsibility'),
        public: b.getBool('public'),
        categories: codes(b.getStringSlice('categories')),
        columns: b
          .getStringSlice('columns')
          .filter((id) => id in columnName)
          .map((id) => columnName[id]),
      }))
      .sort((a, b) => a.day - b.day || (a.starts_at < b.starts_at ? -1 : 1)),
  }
}

// --- Validation (M8-22) -----------------------------------------------------------

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Checks a parsed template and returns it normalized. Throws a 400 naming the first problem:
 * `template_format` (not a template), `template_too_new` (a newer format version) or
 * `template_invalid` (with the path of the broken value).
 */
function validate(data) {
  if (!isObject(data) || data.format !== FORMAT) {
    throw templateError('template_format', 'This file is not a Judge26 event template.')
  }
  const version = data.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw invalid('version', 'must be a whole number')
  }
  if (version > VERSION) {
    throw templateError(
      'template_too_new',
      `This template was made with a newer version of Judge26 (format ${version}); this installation reads format ${VERSION}.`,
      { version, supported: VERSION },
    )
  }

  const text = (value, path, options) => {
    const o = options || {}
    if (value === undefined || value === null) value = ''
    if (typeof value !== 'string') throw invalid(path, 'must be text')
    if (o.required && !value.trim()) throw invalid(path, 'is missing')
    if (o.max && value.length > o.max) throw invalid(path, `is longer than ${o.max} characters`)
    if (o.pattern && value && !o.pattern.test(value)) throw invalid(path, 'has an invalid format')
    return value
  }
  const int = (value, path, min, max, fallback) => {
    if (value === undefined || value === null) return fallback
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw invalid(path, 'must be a whole number')
    }
    if (value < min || value > max) throw invalid(path, `must be between ${min} and ${max}`)
    return value
  }
  const array = (value, path) => {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) throw invalid(path, 'must be a list')
    return value
  }
  const object = (value, path) => {
    if (!isObject(value)) throw invalid(path, 'must be an object')
    return value
  }
  const unique = (seen, value, path) => {
    const key = String(value).toLowerCase()
    if (seen[key]) throw invalid(path, `“${value}” appears twice`)
    seen[key] = true
  }

  const event = isObject(data.event) ? data.event : {}
  const out = {
    format: FORMAT,
    version: VERSION,
    name: text(data.name, 'name', { max: 200 }),
    description: text(data.description, 'description', { max: 2000 }),
    event: {
      venue: text(event.venue, 'event.venue', { max: 200 }),
      description: text(event.description, 'event.description', { max: 5000 }),
    },
    days: [],
    categories: [],
    tables: [],
    columns: [],
    blocks: [],
  }

  const offsets = {}
  array(data.days, 'days').forEach((d, i) => {
    const path = `days[${i}]`
    object(d, path)
    const offset = int(d.offset, `${path}.offset`, 0, MAX_DAYS - 1, undefined)
    if (offset === undefined) throw invalid(`${path}.offset`, 'is missing')
    unique(offsets, offset, `${path}.offset`)
    const day = {
      offset,
      label: text(d.label, `${path}.label`, { max: 100 }),
      starts_at: text(d.starts_at, `${path}.starts_at`, { pattern: TIME }),
      ends_at: text(d.ends_at, `${path}.ends_at`, { pattern: TIME }),
    }
    if (day.starts_at && day.ends_at && day.ends_at <= day.starts_at) {
      throw invalid(`${path}.ends_at`, 'must be after the start')
    }
    out.days.push(day)
  })
  out.days.sort((a, b) => a.offset - b.offset)
  if (out.days.length && out.days[0].offset !== 0) {
    throw invalid('days', 'the first day must have offset 0')
  }
  const dayRef = (value, path, required) => {
    if (value === undefined || value === null || value === '') {
      if (required) throw invalid(path, 'is missing')
      return null
    }
    if (typeof value !== 'number' || !(String(value) in offsets)) {
      throw invalid(
        path,
        `refers to day ${JSON.stringify(value)}, which the template does not define`,
      )
    }
    return value
  }

  const codes = {}
  array(data.categories, 'categories').forEach((c, i) => {
    const path = `categories[${i}]`
    object(c, path)
    const code = text(c.code, `${path}.code`, { required: true, max: 50, pattern: CODE })
    unique(codes, code, `${path}.code`)
    const category = {
      code,
      name: text(c.name, `${path}.name`, { required: true, max: 200 }),
      description: text(c.description, `${path}.description`, { max: 5000 }),
      min_age: int(c.min_age, `${path}.min_age`, 0, 100, 0),
      max_age: int(c.max_age, `${path}.max_age`, 0, 100, 0),
      min_team_size: int(c.min_team_size, `${path}.min_team_size`, 0, 20, 0),
      max_team_size: int(c.max_team_size, `${path}.max_team_size`, 0, 20, 0),
      max_teams: int(c.max_teams, `${path}.max_teams`, 0, 100000, 0),
      judges_per_table: int(c.judges_per_table, `${path}.judges_per_table`, 0, 10, 0),
      settings: c.settings === undefined ? null : c.settings,
      ranking: c.ranking === undefined ? null : c.ranking,
      game_rules: [],
      rounds: [],
    }
    if (category.settings !== null && !isObject(category.settings)) {
      throw invalid(`${path}.settings`, 'must be an object')
    }
    if (category.ranking !== null && !isObject(category.ranking)) {
      throw invalid(`${path}.ranking`, 'must be an object')
    }
    const ruleKeys = {}
    array(c.game_rules, `${path}.game_rules`).forEach((r, j) => {
      const rpath = `${path}.game_rules[${j}]`
      object(r, rpath)
      const key = text(r.key, `${rpath}.key`, { required: true, max: 50 })
      unique(ruleKeys, key, `${rpath}.key`)
      let ruleset = null
      if (r.ruleset !== undefined && r.ruleset !== null) {
        object(r.ruleset, `${rpath}.ruleset`)
        if (!isObject(r.ruleset.definition)) {
          throw invalid(`${rpath}.ruleset.definition`, 'must be an object')
        }
        ruleset = {
          definition: r.ruleset.definition,
          notes: text(r.ruleset.notes, `${rpath}.ruleset.notes`, { max: 5000 }),
        }
      }
      category.game_rules.push({
        key,
        name: text(r.name, `${rpath}.name`, { required: true, max: 200 }),
        description: text(r.description, `${rpath}.description`, { max: 5000 }),
        position: int(r.position, `${rpath}.position`, 0, 100000, j + 1),
        ruleset,
      })
    })
    const roundKeys = {}
    array(c.rounds, `${path}.rounds`).forEach((r, j) => {
      const rpath = `${path}.rounds[${j}]`
      object(r, rpath)
      const key = text(r.key, `${rpath}.key`, { required: true, max: 50 })
      unique(roundKeys, key, `${rpath}.key`)
      const gameRule = text(r.game_rule, `${rpath}.game_rule`, { max: 50 })
      if (gameRule && !ruleKeys[gameRule.toLowerCase()]) {
        throw invalid(
          `${rpath}.game_rule`,
          `refers to “${gameRule}”, which the category does not define`,
        )
      }
      const round = {
        key,
        name: text(r.name, `${rpath}.name`, { required: true, max: 200 }),
        position: int(r.position, `${rpath}.position`, 0, 100000, j + 1),
        game_rule: gameRule,
        testing_minutes: int(r.testing_minutes, `${rpath}.testing_minutes`, 0, 1440, 0),
        scoring_minutes: int(r.scoring_minutes, `${rpath}.scoring_minutes`, 1, 1440, 15),
        phases: [],
      }
      const seen = {}
      array(r.phases, `${rpath}.phases`).forEach((p, k) => {
        const ppath = `${rpath}.phases[${k}]`
        object(p, ppath)
        if (!PHASES.includes(p.phase)) throw invalid(`${ppath}.phase`, 'is not a known phase')
        unique(seen, p.phase, `${ppath}.phase`)
        const phase = {
          phase: p.phase,
          day: dayRef(p.day, `${ppath}.day`, false),
          starts_at: text(p.starts_at, `${ppath}.starts_at`, { pattern: TIME }),
          duration_minutes: int(p.duration_minutes, `${ppath}.duration_minutes`, 1, 1440, 1),
        }
        if (phase.starts_at && phase.day === null) {
          throw invalid(`${ppath}.day`, 'is missing for a phase with a start time')
        }
        round.phases.push(phase)
      })
      category.rounds.push(round)
    })
    out.categories.push(category)
  })
  const categoryRefs = (value, path) =>
    array(value, path).map((code, k) => {
      if (typeof code !== 'string' || !codes[code.toLowerCase()]) {
        throw invalid(
          `${path}[${k}]`,
          `refers to category ${JSON.stringify(code)}, which the template does not define`,
        )
      }
      return out.categories.find((c) => c.code.toLowerCase() === code.toLowerCase()).code
    })

  const tableNames = {}
  array(data.tables, 'tables').forEach((t, i) => {
    const path = `tables[${i}]`
    object(t, path)
    const name = text(t.name, `${path}.name`, { required: true, max: 100 })
    unique(tableNames, name, `${path}.name`)
    out.tables.push({
      name,
      position: int(t.position, `${path}.position`, 0, 100000, i + 1),
      active: t.active === undefined ? true : !!t.active,
      categories: categoryRefs(t.categories, `${path}.categories`),
    })
  })

  const columnNames = {}
  array(data.columns, 'columns').forEach((c, i) => {
    const path = `columns[${i}]`
    object(c, path)
    const name = text(c.name, `${path}.name`, { required: true, max: 60 })
    unique(columnNames, name, `${path}.name`)
    out.columns.push({
      name,
      position: int(c.position, `${path}.position`, 0, 100000, i + 1),
      public: !!c.public,
    })
  })

  array(data.blocks, 'blocks').forEach((b, i) => {
    const path = `blocks[${i}]`
    object(b, path)
    const color = text(b.color, `${path}.color`)
    if (color && !COLORS.includes(color)) throw invalid(`${path}.color`, 'is not a known color')
    out.blocks.push({
      day: dayRef(b.day, `${path}.day`, true),
      starts_at: text(b.starts_at, `${path}.starts_at`, { required: true, pattern: TIME }),
      duration_minutes: int(b.duration_minutes, `${path}.duration_minutes`, 5, 1440, undefined),
      title: text(b.title, `${path}.title`, { required: true, max: 100 }),
      place: text(b.place, `${path}.place`, { max: 100 }),
      color,
      responsibility: text(b.responsibility, `${path}.responsibility`, { max: 200 }),
      public: !!b.public,
      categories: categoryRefs(b.categories, `${path}.categories`),
      columns: array(b.columns, `${path}.columns`).map((name, k) => {
        if (typeof name !== 'string' || !columnNames[name.toLowerCase()]) {
          throw invalid(
            `${path}.columns[${k}]`,
            `refers to column ${JSON.stringify(name)}, which the template does not define`,
          )
        }
        return name
      }),
    })
    if (out.blocks[i].duration_minutes === undefined) {
      throw invalid(`${path}.duration_minutes`, 'is missing')
    }
  })
  return out
}

/** Parses an uploaded file's text; see validate(). */
function parse(content) {
  if (isObject(content)) return validate(content)
  let data = null
  try {
    data = JSON.parse(String(content || ''))
  } catch (_) {
    throw templateError('template_not_json', 'This file is not valid JSON.')
  }
  return validate(data)
}

// --- New event from a template (M8-23) ----------------------------------------------

/**
 * Creates an independent event from a validated template, inside the given transaction.
 * `input`: { name, first_day (YYYY-MM-DD), season?, venue? }. Dates shift so the template's
 * first day falls on `first_day`. Any record the template cannot produce fails the whole
 * creation with the path of the template value.
 */
function createEvent(tx, template, input, auth) {
  const save = (record, path) => {
    try {
      tx.save(record)
    } catch (err) {
      const data = err && err.value && err.value.data ? err.value.data : null
      const detail = data ? Object.keys(data)[0] : String((err && err.message) || err)
      throw invalid(path, detail)
    }
    return record
  }
  const collection = (name) => tx.findCollectionByNameOrId(name)
  const first = dayNumber(input.first_day)

  const event = new Record(collection('events'))
  event.set('name', input.name)
  event.set('season', input.season || Number(input.first_day.slice(0, 4)))
  event.set(
    'venue',
    input.venue !== undefined && input.venue !== '' ? input.venue : template.event.venue,
  )
  event.set('description', template.event.description)
  event.set('status', 'draft')
  tx.save(event)

  const dayIds = {}
  template.days.forEach((d, i) => {
    const day = new Record(collection('competition_days'))
    day.set('event', event.id)
    day.set('date', dateOf(first + d.offset))
    day.set('label', d.label)
    day.set('starts_at', d.starts_at)
    day.set('ends_at', d.ends_at)
    save(day, `days[${i}]`)
    dayIds[d.offset] = day.id
  })
  const dayId = (offset) => (offset === null ? '' : dayIds[offset] || '')

  const categoryIds = {}
  template.categories.forEach((c, i) => {
    const path = `categories[${i}]`
    const category = new Record(collection('categories'))
    category.set('event', event.id)
    for (const field of [
      'code',
      'name',
      'description',
      'min_age',
      'max_age',
      'min_team_size',
      'max_team_size',
      'max_teams',
      'settings',
      'ranking',
    ]) {
      category.set(field, c[field])
    }
    if (c.judges_per_table) category.set('judges_per_table', c.judges_per_table)
    save(category, path)
    categoryIds[c.code.toLowerCase()] = category.id

    const ruleIds = {}
    c.game_rules.forEach((r, j) => {
      const rpath = `${path}.game_rules[${j}]`
      const rule = new Record(collection('game_rules'))
      rule.set('category', category.id)
      rule.set('key', r.key)
      rule.set('name', r.name)
      rule.set('description', r.description)
      rule.set('position', r.position)
      save(rule, rpath)
      ruleIds[r.key.toLowerCase()] = rule.id
      if (r.ruleset) {
        const ruleset = new Record(collection('rulesets'))
        ruleset.set('category', category.id)
        ruleset.set('game_rule', rule.id)
        ruleset.set('status', 'published')
        ruleset.set('definition', r.ruleset.definition)
        ruleset.set('notes', r.ruleset.notes || `From template “${template.name}”.`)
        if (auth && !auth.isSuperuser()) ruleset.set('published_by', auth.id)
        save(ruleset, `${rpath}.ruleset`)
      }
    })

    c.rounds.forEach((r, j) => {
      const rpath = `${path}.rounds[${j}]`
      const scoring = r.phases.find((p) => p.phase === 'scoring')
      const round = new Record(collection('rounds'))
      round.set('category', category.id)
      round.set('key', r.key)
      round.set('name', r.name)
      round.set('position', r.position)
      round.set('game_rule', r.game_rule ? ruleIds[r.game_rule.toLowerCase()] : '')
      round.set('testing_minutes', r.testing_minutes)
      round.set('scoring_minutes', r.scoring_minutes)
      round.set('day', scoring ? dayId(scoring.day) : '')
      save(round, rpath)
      // Saving the round created its maintenance and scoring phases (hooks/planner.pb.js);
      // place them as in the template and add the robot check.
      r.phases.forEach((p, k) => {
        if (p.phase === 'maintenance' && r.testing_minutes <= 0) return
        let phase = null
        try {
          phase = tx.findFirstRecordByFilter('round_phases', 'round = {:r} && phase = {:p}', {
            r: round.id,
            p: p.phase,
          })
        } catch (_) {
          phase = new Record(collection('round_phases'))
          phase.set('round', round.id)
          phase.set('phase', p.phase)
        }
        phase.set('day', dayId(p.day))
        phase.set('starts_at', p.starts_at)
        phase.set('duration_minutes', p.duration_minutes)
        save(phase, `${rpath}.phases[${k}]`)
      })
    })
  })
  const categoryList = (list) => list.map((code) => categoryIds[code.toLowerCase()])

  template.tables.forEach((t, i) => {
    const table = new Record(collection('tables'))
    table.set('event', event.id)
    table.set('name', t.name)
    table.set('position', t.position)
    table.set('active', t.active)
    table.set('categories', categoryList(t.categories))
    save(table, `tables[${i}]`)
  })

  const columnIds = {}
  template.columns.forEach((c, i) => {
    const column = new Record(collection('schedule_columns'))
    column.set('event', event.id)
    column.set('name', c.name)
    column.set('position', c.position)
    column.set('public', c.public)
    save(column, `columns[${i}]`)
    columnIds[c.name.toLowerCase()] = column.id
  })

  template.blocks.forEach((b, i) => {
    const block = new Record(collection('schedule_blocks'))
    block.set('event', event.id)
    block.set('day', dayId(b.day))
    for (const field of [
      'starts_at',
      'duration_minutes',
      'title',
      'place',
      'color',
      'responsibility',
      'public',
    ]) {
      block.set(field, b[field])
    }
    block.set('categories', categoryList(b.categories))
    block.set(
      'columns',
      b.columns.map((name) => columnIds[name.toLowerCase()]),
    )
    save(block, `blocks[${i}]`)
  })
  return event
}

/** Validates the body of "new event from template". */
function eventInput(body) {
  const { fieldError } = require(`${__hooks}/lib/errors.js`)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) fieldError('name', 'validation_required', 'Enter a name.')
  if (name.length > 200) fieldError('name', 'validation_length_too_long', 'The name is too long.')
  const firstDay = typeof body.first_day === 'string' ? body.first_day : ''
  if (!validDate(firstDay)) fieldError('first_day', 'invalid_date', 'Choose the first day.')
  let season = Number(firstDay.slice(0, 4))
  if (body.season !== undefined && body.season !== null && body.season !== '') {
    season = Number(body.season)
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      fieldError('season', 'validation_invalid', 'Enter a season between 2000 and 2100.')
    }
  }
  const venue = typeof body.venue === 'string' ? body.venue.trim() : ''
  return { name, first_day: firstDay, season, venue }
}

// --- Setup checklist (M8-20) -------------------------------------------------------

/**
 * What is set up in an event. Each step has `done`, the steps it `needs` (the data a step
 * builds on; the others can be done in any order) and the numbers behind it.
 */
function setupStatus(app, eventId) {
  const rulesets = require(`${__hooks}/lib/rulesets.js`)
  const event = app.findRecordById('events', eventId)
  const params = { e: eventId }
  const count = (collection, filter, extra) => {
    const p = Object.assign({}, params, extra || {})
    return list(app, collection, filter, '', p).length
  }

  const days = count('competition_days', 'event = {:e}')
  const categories = list(app, 'categories', 'event = {:e}', 'code', params)
  const withoutRuleset = []
  const withoutRounds = []
  const withoutTables = []
  let rounds = 0
  let timed = 0
  let expectedGames = 0
  const tables = list(app, 'tables', 'event = {:e} && active = true', '', params)
  categories.forEach((c) => {
    const rules = rulesets.gameRules(app, c.id)
    if (!rules.length || rules.some((r) => !rulesets.activeRuleset(app, r.id))) {
      withoutRuleset.push(c.getString('code'))
    }
    const own = list(app, 'rounds', 'category = {:c}', '', { c: c.id })
    if (!own.length) withoutRounds.push(c.getString('code'))
    rounds += own.length
    own.forEach((r) => {
      try {
        const phase = app.findFirstRecordByFilter(
          'round_phases',
          'round = {:r} && phase = "scoring"',
          { r: r.id },
        )
        if (phase.getString('day') && phase.getString('starts_at')) timed++
      } catch (_) {
        // a round without its scoring phase is not timed
      }
    })
    if (!tables.some((t) => t.getStringSlice('categories').includes(c.id))) {
      withoutTables.push(c.getString('code'))
    }
    const teams = count('teams', 'category = {:c} && status = "approved"', { c: c.id })
    expectedGames += teams * own.length
  })
  const teams = count('teams', 'event = {:e} && status = "approved"')
  const judges = count(
    'role_assignments',
    'event = {:e} && (role = "judge" || role = "head_judge") && user.preview_of = ""',
  )
  const tablesWithoutJudges = tables.filter((t) => !t.getStringSlice('judges').length).length
  const placed = list(
    app,
    'games',
    'round.category.event = {:e} && team.status = "approved" && table != "" && attempt <= 1',
    '',
    params,
  ).length
  const hasCategories = categories.length > 0

  const steps = [
    { key: 'days', done: days > 0, needs: [], count: days },
    {
      key: 'categories',
      done: hasCategories && !withoutRuleset.length,
      needs: [],
      count: categories.length,
      missing: withoutRuleset,
    },
    {
      key: 'rounds',
      done: hasCategories && !withoutRounds.length,
      needs: ['categories'],
      count: rounds,
      missing: withoutRounds,
    },
    // M9-C: tables come after teams and judges, the order events are set up in: the board
    // creates the tables and puts the invited judges on them.
    { key: 'teams', done: teams > 0, needs: ['categories'], count: teams },
    { key: 'judges', done: judges > 0, needs: [], count: judges },
    {
      key: 'tables',
      done: hasCategories && !withoutTables.length && tablesWithoutJudges === 0,
      needs: ['categories', 'judges'],
      count: tables.length,
      missing: withoutTables,
      tables_without_judges: tablesWithoutJudges,
    },
    {
      key: 'schedule',
      done: expectedGames > 0 && placed >= expectedGames && rounds > 0 && timed === rounds,
      needs: ['days', 'rounds', 'tables', 'teams'],
      placed: Math.min(placed, expectedGames),
      expected: expectedGames,
      timed,
      rounds,
    },
    {
      key: 'publish',
      done: event.getString('status') !== 'draft',
      needs: ['schedule'],
      status: event.getString('status'),
    },
  ]
  return { steps, complete: steps.every((s) => s.done) }
}

// --- Library (M8-24) ---------------------------------------------------------------

/** Only admins manage the template library and create events from it. */
function requireAdmin(e) {
  const access = require(`${__hooks}/lib/access.js`)
  if (!access.isVerifiedUser(e.auth) || !access.isAdmin(e.app, e.auth)) {
    throw new ForbiddenError('Only admins can manage event templates.', {
      _error: new ValidationError(
        'templates_admin_only',
        'Only admins can manage event templates.',
      ),
    })
  }
}

/** Stores a validated template in the library and records it in the audit log. */
function save(e, template, meta) {
  const record = new Record(e.app.findCollectionByNameOrId('event_templates'))
  record.set('name', meta.name || template.name || 'Event template')
  record.set('description', meta.description || template.description || '')
  record.set('data', template)
  record.set('format_version', template.version)
  record.set('origin', meta.origin)
  if (e.auth && !e.auth.isSuperuser()) record.set('created_by', e.auth.id)
  e.app.save(record)
  const audit = require(`${__hooks}/lib/audit.js`)
  audit.log(e.app, {
    auth: e.auth,
    action: 'template.save',
    collection: 'event_templates',
    record: record.id,
    event: meta.event || '',
    summary: `Saved event template “${record.getString('name')}” (${meta.origin})`,
    ip: audit.requestIp(e),
  })
  return record
}

module.exports = {
  requireAdmin,
  save,
  FORMAT,
  VERSION,
  exportEvent,
  validate,
  parse,
  createEvent,
  eventInput,
  setupStatus,
  templateError,
}
