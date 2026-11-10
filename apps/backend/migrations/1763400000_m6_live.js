/// <reference path="../pb_data/types.d.ts" />

// M6: result publication per category and a per-event revision counter that public displays
// subscribe to. See docs/specifications/M6-live.md.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const events = app.findCollectionByNameOrId('events')
    const categories = app.findCollectionByNameOrId('categories')
    const snapshots = app.findCollectionByNameOrId('ranking_snapshots')

    // Publication (M6-10). Both are off by default: nothing is public until a manager decides.
    // `public_live`: the public sees the live (provisional) ranking from finalized scores.
    categories.fields.add(new BoolField({ name: 'public_live' }))
    // `published_snapshot`: the official ranking shown to the public (an immutable snapshot).
    categories.fields.add(
      new RelationField({ name: 'published_snapshot', collectionId: snapshots.id, maxSelect: 1 }),
    )
    // Set by the server when the official ranking changes.
    categories.fields.add(new DateField({ name: 'results_published_at' }))
    categories.fields.add(
      new RelationField({ name: 'results_published_by', collectionId: users.id, maxSelect: 1 }),
    )
    app.save(categories)

    // One record per event; `revision` increases whenever public competition data changes.
    // Displays subscribe to it (realtime) and reload, instead of subscribing to restricted data.
    const revisions = new Collection({
      type: 'base',
      name: 'live_revisions',
      fields: [
        {
          type: 'relation',
          name: 'event',
          required: true,
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'number', name: 'revision', onlyInt: true, min: 0 },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_live_revisions_event` ON `live_revisions` (`event`)'],
    })
    // The record holds nothing but a counter. Readable by anyone for public events, and by
    // signed-in users (staff preparing a draft event). Written only by hooks.
    revisions.listRule =
      '(event.status = "published" || event.status = "archived") || @request.auth.id != ""'
    revisions.viewRule = revisions.listRule
    revisions.createRule = null
    revisions.updateRule = null
    revisions.deleteRule = null
    app.save(revisions)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('live_revisions'))
    const categories = app.findCollectionByNameOrId('categories')
    for (const name of [
      'public_live',
      'published_snapshot',
      'results_published_at',
      'results_published_by',
    ]) {
      categories.fields.removeByName(name)
    }
    app.save(categories)
  },
)
