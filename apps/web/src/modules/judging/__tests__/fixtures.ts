import type { RulesetDefinition } from '@judge26/scoring-engine'
import type { Assignment, ScoreSheet, SheetPayload } from '../types'

/** Flag (required, 10), blocks (required, 5 each), parking: exactly one of full (15) / partial (5). */
export const RULESET: RulesetDefinition = {
  schemaVersion: 1,
  precision: 0,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [
      { id: 'flag', label: 'Flag raised', type: 'boolean', points: 10, required: true },
      {
        id: 'blocks',
        label: 'Blocks',
        type: 'number',
        integer: true,
        min: 0,
        max: 6,
        pointsPerUnit: 5,
        required: true,
      },
      {
        id: 'parking',
        label: 'Parking',
        type: 'group',
        aggregate: 'sum',
        selection: { min: 1, max: 1 },
        children: [
          { id: 'full', label: 'Fully parked', type: 'boolean', points: 15 },
          { id: 'partial', label: 'Partly parked', type: 'boolean', points: 5 },
        ],
      },
    ],
  },
}

export function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'game1',
    status: 'scheduled',
    attempt: 1,
    sequence: 1,
    points: 0,
    time_ms: 0,
    team: { id: 'team1', name: 'Robo Rangers' },
    round: { id: 'r1', key: 'R1', name: 'Round 1', position: 1 },
    category: { id: 'cat1', name: 'RoboMission Junior', code: 'RM-J' },
    event: { id: 'event1', name: 'WRO Final', status: 'published' },
    table: { id: 't1', name: 'Table A' },
    day: null,
    sheet: null,
    ...overrides,
  }
}

export function makeSheet(overrides: Partial<ScoreSheet> = {}): ScoreSheet {
  const nobody = { id: '', name: '' }
  return {
    id: 'sheet1',
    status: 'draft',
    outcome: 'completed',
    ruleset: 'rs1',
    values: {},
    time_ms: 0,
    points: 0,
    client_saved_at: 0,
    judge: { id: 'user1', name: 'Judge' },
    submitted_at: '',
    submitted_by: nobody,
    reviewed_at: '',
    reviewed_by: nobody,
    review_note: '',
    corrections: 0,
    mulligans: 0,
    mulligan_reason: '',
    mulligan_at: '',
    mulligan_by: nobody,
    updated: '',
    ...overrides,
  }
}

export function makePayload(overrides: Partial<SheetPayload> = {}): SheetPayload {
  return {
    game: {
      id: 'game1',
      status: 'scheduled',
      attempt: 1,
      sequence: 3,
      points: 0,
      time_ms: 0,
      updated: '',
    },
    team: { id: 'team1', name: 'Robo Rangers', organization: '', country: 'CH' },
    round: {
      id: 'r1',
      key: 'R1',
      name: 'Round 1',
      position: 1,
      testing_minutes: 0,
      scoring_minutes: 10,
    },
    category: { id: 'cat1', name: 'RoboMission Junior', code: 'RM-J' },
    event: { id: 'event1', name: 'WRO Final', status: 'published' },
    table: { id: 't1', name: 'Table A' },
    day: { id: 'sat', date: '2026-06-13', label: 'Saturday' },
    ruleset: { id: 'rs1', version: 2, definition: RULESET },
    sheet: null,
    history: [],
    permissions: { canEdit: true, canReview: false, canCorrect: false },
    ...overrides,
  }
}
