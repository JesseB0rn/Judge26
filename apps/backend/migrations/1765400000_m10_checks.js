/// <reference path="../pb_data/types.d.ts" />

// M10-B: robot check, parts check and round file (M10-08 – M10-17).
// - rounds.check_mode: off | synchronous | asynchronous. New rounds default to synchronous
//   (hooks/checks.pb.js); existing rounds keep what they have: synchronous where the planner
//   has a robot check phase, off otherwise. The check phase and the mode mirror each other.
// - rounds.released_*: the head judge released a synchronous round for scoring (M10-11).
// - robot_checks: one row per team and round, with the table, judge and time (M10-10).
// - robot_check_tables: a table confirmed its check as complete (ready for the run).
// - schedule_blocks.kind = parts_check, blocks_first_round and completed_* (M10-15, M10-16);
//   parts_check_tables: a table's judge confirmed the parts check.
// - round_files: the randomization file of a round (M10-17), never public.
// The new collections have no API rules: only the custom routes in hooks/checks.pb.js read and
// write them, with the permission checks of hooks/lib/checks.js.
// See docs/specifications/M10-checks.md.

const MAX_FILE = 10 * 1024 * 1024
const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const tables = app.findCollectionByNameOrId('tables')
    const teams = app.findCollectionByNameOrId('teams')

    const rounds = app.findCollectionByNameOrId('rounds')
    rounds.fields.add(
      new SelectField({
        name: 'check_mode',
        maxSelect: 1,
        values: ['off', 'synchronous', 'asynchronous'],
      }),
    )
    rounds.fields.add(new DateField({ name: 'released_at' }))
    rounds.fields.add(
      new RelationField({ name: 'released_by', collectionId: users.id, maxSelect: 1 }),
    )
    rounds.fields.add(new TextField({ name: 'release_reason', max: 2000 }))
    app.save(rounds)

    // Existing rounds keep what they have (M10-T12).
    for (const round of app.findAllRecords('rounds')) {
      const phases = app.findRecordsByFilter(
        'round_phases',
        'round = {:r} && phase = "check"',
        '',
        1,
        0,
        { r: round.id },
      )
      round.set('check_mode', phases.length ? 'synchronous' : 'off')
      app.saveNoValidate(round)
    }

    const blocks = app.findCollectionByNameOrId('schedule_blocks')
    blocks.fields.add(new SelectField({ name: 'kind', maxSelect: 1, values: ['parts_check'] }))
    blocks.fields.add(new BoolField({ name: 'blocks_first_round' }))
    blocks.fields.add(new DateField({ name: 'completed_at' }))
    blocks.fields.add(
      new RelationField({ name: 'completed_by', collectionId: users.id, maxSelect: 1 }),
    )
    blocks.fields.add(new TextField({ name: 'completion_note', max: 2000 }))
    app.save(blocks)

    const relation = (name, collectionId, required = true, cascadeDelete = true) => ({
      type: 'relation',
      name,
      required,
      collectionId,
      maxSelect: 1,
      cascadeDelete,
    })
    const user = (name) => relation(name, users.id, false, false)
    const dates = [
      { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ]

    app.save(
      new Collection({
        type: 'base',
        name: 'robot_checks',
        fields: [
          relation('round', rounds.id),
          relation('team', teams.id),
          relation('table', tables.id, false, false),
          // false after a reopened check; the row keeps the device time of the last change.
          { type: 'bool', name: 'checked' },
          user('checked_by'),
          { type: 'date', name: 'checked_at' },
          // Epoch ms of the judge's change on the device; older offline changes lose (M10-10).
          { type: 'number', name: 'client_saved_at', onlyInt: true },
          ...dates,
        ],
        indexes: [
          'CREATE UNIQUE INDEX `idx_robot_checks_round_team` ON `robot_checks` (`round`, `team`)',
        ],
      }),
    )

    app.save(
      new Collection({
        type: 'base',
        name: 'robot_check_tables',
        fields: [
          relation('round', rounds.id),
          relation('table', tables.id),
          user('ready_by'),
          { type: 'date', name: 'ready_at', required: true },
          ...dates,
        ],
        indexes: [
          'CREATE UNIQUE INDEX `idx_robot_check_tables` ON `robot_check_tables` (`round`, `table`)',
        ],
      }),
    )

    app.save(
      new Collection({
        type: 'base',
        name: 'parts_check_tables',
        fields: [
          relation('block', blocks.id),
          relation('table', tables.id),
          user('confirmed_by'),
          { type: 'date', name: 'confirmed_at', required: true },
          ...dates,
        ],
        indexes: [
          'CREATE UNIQUE INDEX `idx_parts_check_tables` ON `parts_check_tables` (`block`, `table`)',
        ],
      }),
    )

    app.save(
      new Collection({
        type: 'base',
        name: 'round_files',
        fields: [
          relation('round', rounds.id),
          {
            type: 'file',
            name: 'file',
            required: true,
            maxSelect: 1,
            maxSize: MAX_FILE,
            mimeTypes: FILE_TYPES,
            protected: true,
          },
          // The uploaded file's own name, shown to judges and used for downloads.
          { type: 'text', name: 'name', max: 255 },
          user('uploaded_by'),
          ...dates,
        ],
        indexes: ['CREATE UNIQUE INDEX `idx_round_files_round` ON `round_files` (`round`)'],
      }),
    )
  },
  (app) => {
    for (const name of [
      'round_files',
      'parts_check_tables',
      'robot_check_tables',
      'robot_checks',
    ]) {
      app.delete(app.findCollectionByNameOrId(name))
    }
    const blocks = app.findCollectionByNameOrId('schedule_blocks')
    for (const name of [
      'kind',
      'blocks_first_round',
      'completed_at',
      'completed_by',
      'completion_note',
    ]) {
      blocks.fields.removeByName(name)
    }
    app.save(blocks)
    const rounds = app.findCollectionByNameOrId('rounds')
    for (const name of ['check_mode', 'released_at', 'released_by', 'release_reason']) {
      rounds.fields.removeByName(name)
    }
    app.save(rounds)
  },
)
