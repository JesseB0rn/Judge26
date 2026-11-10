/// <reference path="../../pb_data/types.d.ts" />

// M5: teams are ordered on a table within a round; round phases carry the time budget.

function placementIssues(app, game, round) {
  const tableId = game.getString('table')
  const sequence = game.getInt('sequence')
  if (!tableId) {
    return sequence === 0
      ? []
      : [
          {
            field: 'sequence',
            code: 'table_required',
            message: 'Assign a table before setting the team sequence.',
          },
        ]
  }

  const issues = []
  const table = app.findRecordById('tables', tableId)
  const eventId = app.findRecordById('categories', round.getString('category')).getString('event')

  if (table.getString('event') !== eventId) {
    issues.push({
      field: 'table',
      code: 'invalid_table',
      message: 'The table belongs to a different event.',
    })
  } else {
    if (!table.getBool('active')) {
      issues.push({
        field: 'table',
        code: 'table_inactive',
        message: 'The table is deactivated.',
      })
    }
    const categories = table.getStringSlice('categories')
    if (categories.length > 0 && !categories.includes(round.getString('category'))) {
      issues.push({
        field: 'table',
        code: 'incompatible_category',
        message: 'The table is not available for this category.',
      })
    }
    if (!table.getString('judge')) {
      issues.push({
        field: 'table',
        code: 'missing_table_judge',
        message: 'Assign a judge to the table before scheduling games there.',
      })
    }
  }

  if (sequence < 1) {
    issues.push({
      field: 'sequence',
      code: 'required',
      message: 'The team sequence must be a positive number.',
    })
  } else if (
    exists(
      app,
      'games',
      'round = {:round} && table = {:table} && sequence = {:sequence} && id != {:id}',
      {
        round: round.id,
        table: tableId,
        sequence,
        id: game.id,
      },
    )
  ) {
    issues.push({
      field: 'sequence',
      code: 'sequence_in_use',
      message: 'That sequence number is already used on this table in this round.',
    })
  }

  return issues
}

function exists(app, collection, filter, params) {
  return app.findRecordsByFilter(collection, filter, '', 1, 0, params).length > 0
}

function checkPlacement(app, game, round) {
  const issues = placementIssues(app, game, round)
  if (issues.length) {
    const { fieldError } = require(`${__hooks}/lib/errors.js`)
    fieldError(issues[0].field, issues[0].code, issues[0].message)
  }
}

function gameKey(roundId, teamId) {
  return `${roundId}:${teamId}`
}

function eligibleTables(tables, categoryId) {
  return tables
    .filter(
      (table) =>
        table.getBool('active') &&
        table.getString('judge') &&
        (!table.getStringSlice('categories').length ||
          table.getStringSlice('categories').includes(categoryId)),
    )
    .sort(
      (a, b) =>
        a.getInt('position') - b.getInt('position') ||
        a.getString('name').localeCompare(b.getString('name')),
    )
}

/**
 * Creates missing first-attempt games and assigns all unplaced games to a table and per-table
 * sequence. Assignment choices are deterministic and balanced by game count within each round.
 */
function generate(app, eventId, dryRun) {
  const rounds = app.findRecordsByFilter('rounds', 'category.event = {:event}', 'position', 0, 0, {
    event: eventId,
  })
  const teams = app.findRecordsByFilter(
    'teams',
    'event = {:event} && status = "approved"',
    'name',
    0,
    0,
    { event: eventId },
  )
  const tables = app.findRecordsByFilter('tables', 'event = {:event}', 'position,name', 0, 0, {
    event: eventId,
  })
  const gameRecords = app.findRecordsByFilter(
    'games',
    'round.category.event = {:event}',
    'created',
    0,
    0,
    { event: eventId },
  )
  const gamesByKey = new Set(
    gameRecords.map((game) => gameKey(game.getString('round'), game.getString('team'))),
  )
  const plans = gameRecords.map((record) => ({
    id: record.id,
    record,
    roundId: record.getString('round'),
    teamId: record.getString('team'),
    categoryId: app.findRecordById('rounds', record.getString('round')).getString('category'),
    teamName: app.findRecordById('teams', record.getString('team')).getString('name'),
    tableId: record.getString('table'),
    sequence: record.getInt('sequence'),
    created: false,
  }))

  let nextId = 0
  for (const round of rounds) {
    const categoryId = round.getString('category')
    for (const team of teams) {
      if (team.getString('category') !== categoryId) continue
      if (gamesByKey.has(gameKey(round.id, team.id))) continue
      plans.push({
        id: `missing:${round.id}:${team.id}:${++nextId}`,
        record: null,
        roundId: round.id,
        teamId: team.id,
        categoryId,
        teamName: team.getString('name'),
        tableId: '',
        sequence: 0,
        created: true,
      })
    }
  }

  const unplaced = []
  const groups = new Map()
  for (const plan of plans) {
    if (!groups.has(plan.roundId)) groups.set(plan.roundId, [])
    groups.get(plan.roundId).push(plan)
  }

  for (const [roundId, roundPlans] of groups) {
    const used = new Map()
    const counts = new Map()
    for (const plan of roundPlans) {
      if (!plan.tableId) continue
      if (!used.has(plan.tableId)) used.set(plan.tableId, new Set())
      if (plan.sequence > 0) used.get(plan.tableId).add(plan.sequence)
      counts.set(plan.tableId, (counts.get(plan.tableId) || 0) + 1)
    }

    for (const plan of roundPlans.sort((a, b) => a.teamName.localeCompare(b.teamName))) {
      if (plan.tableId && plan.sequence > 0) {
        const issues = placementIssues(app, plan.record, app.findRecordById('rounds', roundId))
        if (issues.length) {
          unplaced.push({ gameId: plan.id, label: `${plan.teamName}`, reasons: [issues[0].code] })
        }
        continue
      }

      const candidates = eligibleTables(tables, plan.categoryId)
      if (!candidates.length) {
        const categoryTables = tables.filter(
          (table) =>
            table.getBool('active') &&
            (!table.getStringSlice('categories').length ||
              table.getStringSlice('categories').includes(plan.categoryId)),
        )
        unplaced.push({
          gameId: plan.id,
          label: plan.teamName,
          reasons: [
            !tables.some((table) => table.getBool('active'))
              ? 'no_active_table'
              : categoryTables.length && categoryTables.every((table) => !table.getString('judge'))
                ? 'missing_table_judge'
                : 'no_compatible_table',
          ],
        })
        continue
      }
      const table = candidates.reduce((best, candidate) => {
        if (!best) return candidate
        const candidateCount = counts.get(candidate.id) || 0
        const bestCount = counts.get(best.id) || 0
        return candidateCount < bestCount ? candidate : best
      }, null)
      plan.tableId = table.id
      if (!used.has(table.id)) used.set(table.id, new Set())
      const tableSequences = used.get(table.id)
      plan.sequence = Math.max(0, ...tableSequences) + 1
      tableSequences.add(plan.sequence)
      counts.set(table.id, (counts.get(table.id) || 0) + 1)
    }
  }

  if (unplaced.length) {
    return {
      status: 'infeasible',
      message: 'Some teams could not be assigned to an active table with a judge.',
      placedCount: plans.length - unplaced.length,
      unplaced,
    }
  }

  const placements = plans.map((plan) => ({
    gameId: plan.id,
    table: plan.tableId,
    sequence: plan.sequence,
    label: plan.teamName,
  }))
  const createdGames = plans.filter((plan) => plan.created).length
  if (dryRun) return { status: 'complete', placements, created_games: createdGames }

  app.runInTransaction((tx) => {
    const records = new Map()
    for (const plan of plans) {
      if (plan.created) continue
      const record = tx.findRecordById('games', plan.id)
      record.set('table', '')
      record.set('sequence', 0)
      tx.save(record)
      records.set(plan.id, record)
    }
    for (const plan of plans) {
      if (!plan.created) continue
      const record = new Record(tx.findCollectionByNameOrId('games'))
      record.set('round', plan.roundId)
      record.set('team', plan.teamId)
      record.set('attempt', 1)
      record.set('status', 'scheduled')
      record.set('table', plan.tableId)
      record.set('sequence', plan.sequence)
      tx.save(record)
      records.set(plan.id, record)
    }
    for (const plan of plans) {
      if (plan.created) continue
      const record = records.get(plan.id)
      record.set('table', plan.tableId)
      record.set('sequence', plan.sequence)
      tx.save(record)
    }
  })

  return { status: 'complete', placements, created_games: createdGames }
}

function hasScheduledGames(app, tableId) {
  return exists(app, 'games', 'table = {:table}', { table: tableId })
}

function validateEvent(app, eventId) {
  const games = app.findRecordsByFilter(
    'games',
    'round.category.event = {:event}',
    'round,table,sequence',
    0,
    0,
    { event: eventId },
  )
  const issues = []
  for (const game of games) {
    if (!game.getString('table')) {
      issues.push({
        code: 'missing_table',
        field: 'table',
        gameId: game.id,
        message: 'Assign this team to a table.',
      })
      continue
    }
    const round = app.findRecordById('rounds', game.getString('round'))
    for (const issue of placementIssues(app, game, round)) {
      issues.push({ ...issue, gameId: game.id })
    }
  }
  return issues
}

module.exports = {
  checkPlacement,
  generate,
  hasScheduledGames,
  validateEvent,
}
