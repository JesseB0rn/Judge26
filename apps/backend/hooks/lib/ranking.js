/// <reference path="../../pb_data/types.d.ts" />

/** Builds ranking engine inputs from the stored rounds, approved teams and games. */
function loadInputs(app, categoryId) {
  const rounds = app.findRecordsByFilter('rounds', 'category = {:c}', 'position,key', 0, 0, {
    c: categoryId,
  })
  const keyById = {}
  rounds.forEach((r) => (keyById[r.id] = r.getString('key')))

  const teams = app.findRecordsByFilter(
    'teams',
    'category = {:c} && status = "approved"',
    'name',
    0,
    0,
    {
      c: categoryId,
    },
  )
  const inputs = teams.map((t) => ({ id: t.id, name: t.getString('name'), games: [] }))
  const byTeam = {}
  inputs.forEach((t) => (byTeam[t.id] = t))

  if (rounds.length) {
    const games = app.findRecordsByFilter(
      'games',
      'round.category = {:c} && status != "scheduled"',
      'created',
      0,
      0,
      { c: categoryId },
    )
    games.forEach((g) => {
      const team = byTeam[g.getString('team')]
      if (!team) return
      const status = g.getString('status')
      const time = g.getInt('time_ms')
      team.games.push({
        round: keyById[g.getString('round')],
        attempt: g.getInt('attempt') || 1,
        status,
        points: status === 'completed' ? g.getFloat('points') : null,
        // PocketBase stores empty numbers as 0; a run time of 0 ms means "no time recorded".
        timeMs: status === 'completed' && time > 0 ? time : null,
      })
    })
  }
  return inputs
}

module.exports = { loadInputs }
