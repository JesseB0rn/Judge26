/// <reference path="../pb_data/types.d.ts" />

// M2: versioned scoring rulesets per category. Published versions are immutable
// (M2-14); see docs/specifications/M2-scoring-rulesets.md.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const categories = app.findCollectionByNameOrId('categories')

    const rulesets = new Collection({
      type: 'base',
      name: 'rulesets',
      fields: [
        {
          type: 'relation',
          name: 'category',
          required: true,
          collectionId: categories.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        // Assigned by the server: 1, 2, 3, … per category.
        { type: 'number', name: 'version', onlyInt: true, min: 0 },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['draft', 'published'],
        },
        { type: 'json', name: 'definition', maxSize: 2000000 },
        { type: 'text', name: 'notes', max: 2000 },
        // Set on publication.
        { type: 'text', name: 'fingerprint', max: 32 },
        { type: 'date', name: 'published_at' },
        { type: 'relation', name: 'published_by', collectionId: users.id, maxSelect: 1 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_rulesets_category_version` ON `rulesets` (`category`, `version`)',
      ],
    })
    app.save(rulesets)
    rulesets.fields.add(
      new RelationField({ name: 'source', collectionId: rulesets.id, maxSelect: 1 }),
    )

    // Same visibility as the category; managed like the category; only drafts change.
    const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
    const IS_ADMIN =
      '(@collection.role_assignments:adm.user ?= @request.auth.id && @collection.role_assignments:adm.role ?= "admin")'
    const anyRole = (e) =>
      `(@collection.role_assignments:any.user ?= @request.auth.id && @collection.role_assignments:any.event ?= ${e})`
    const isManager = (e) =>
      `(@collection.role_assignments:mgr.user ?= @request.auth.id && @collection.role_assignments:mgr.event ?= ${e} && @collection.role_assignments:mgr.role ?= "event_manager")`
    const hasOwnTeam = (e) =>
      `(@collection.teams:own.event ?= ${e} && @collection.teams:own.coach ?= @request.auth.id)`
    const E = 'category.event'
    const canSeeEvent = `(${anyRole(E)} || ${E}.status = "published" || (${E}.status = "archived" && ${hasOwnTeam(E)}))`
    const templateManager =
      '(@collection.role_assignments:tpl.user ?= @request.auth.id && @collection.role_assignments:tpl.role ?= "event_manager")'

    rulesets.listRule = `${AUTH} && (${IS_ADMIN} || (${E} = "" && ${templateManager}) || (${E} != "" && ${canSeeEvent}))`
    rulesets.viewRule = rulesets.listRule
    const canManage = `${AUTH} && (${IS_ADMIN} || (${E} != "" && ${isManager(E)} && ${E}.status != "archived"))`
    rulesets.createRule = `${canManage} && @request.body.version:isset = false`
    rulesets.updateRule = `${canManage} && status = "draft" && (@request.body.category:isset = false || @request.body.category = category) && @request.body.version:isset = false`
    rulesets.deleteRule = `${canManage} && status = "draft"`
    app.save(rulesets)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('rulesets'))
  },
)
