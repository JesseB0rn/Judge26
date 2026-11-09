import type { RulesetDefinition } from './types'

/**
 * Example ruleset demonstrating every feature. Offered as a starting point in the
 * ruleset editor. Fictional missions; not an official WRO rule set.
 */
export const EXAMPLE_RULESET: RulesetDefinition = {
  schemaVersion: 1,
  precision: 0,
  root: {
    id: 'total',
    label: 'Total score',
    type: 'group',
    aggregate: 'sum',
    clamp: { min: 0 },
    children: [
      {
        id: 'missions',
        label: 'Missions',
        type: 'group',
        aggregate: 'sum',
        children: [
          {
            id: 'flag',
            label: 'Flag raised',
            description: 'The flag is fully raised and does not touch the base.',
            type: 'boolean',
            points: 10,
            required: true,
          },
          {
            id: 'blocks',
            label: 'Blocks in the storage area',
            description: 'Count blocks completely inside the storage area.',
            type: 'number',
            integer: true,
            min: 0,
            max: 6,
            pointsPerUnit: 5,
            unit: 'blocks',
            required: true,
          },
          {
            id: 'parking',
            label: 'Robot parking',
            description: 'Choose exactly one parking result.',
            type: 'group',
            aggregate: 'sum',
            selection: { min: 1, max: 1 },
            children: [
              { id: 'parkFull', label: 'Completely in the garage', type: 'boolean', points: 15 },
              { id: 'parkPartial', label: 'Partly in the garage', type: 'boolean', points: 5 },
            ],
          },
          {
            id: 'tower',
            label: 'Tower',
            type: 'select',
            required: true,
            options: [
              { id: 'none', label: 'Not built', points: 0 },
              { id: 'two', label: 'Two levels', points: 10 },
              { id: 'three', label: 'Three levels', points: 20 },
            ],
          },
          {
            id: 'bonus',
            label: 'Tower bonus',
            description: 'Only available when the tower has three levels.',
            type: 'boolean',
            points: 15,
            condition: { ref: 'tower', op: 'eq', value: 'three' },
          },
        ],
      },
      {
        id: 'bestAttempt',
        label: 'Best sensor run',
        type: 'group',
        aggregate: 'max',
        children: [
          { id: 'runA', label: 'Sensor run A', type: 'number', min: 0, max: 20, pointsPerUnit: 1 },
          { id: 'runB', label: 'Sensor run B', type: 'number', min: 0, max: 20, pointsPerUnit: 1 },
        ],
      },
      {
        id: 'penalties',
        label: 'Penalties',
        type: 'group',
        aggregate: 'sum',
        deduction: true,
        children: [
          {
            id: 'touches',
            label: 'Robot touched during the run',
            type: 'number',
            integer: true,
            min: 0,
            pointsPerUnit: 5,
            unit: 'touches',
          },
          { id: 'wallDamage', label: 'Wall damaged', type: 'boolean', points: 10 },
        ],
      },
    ],
  },
}
