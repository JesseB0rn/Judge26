/// <reference path="../pb_data/types.d.ts" />

// M1-13: documents attached to a team (e.g. robot description, technical documentation,
// consent forms). Event managers upload them; the team's coach and the event's staff (judges,
// head judges, managers) can read them, among others during a robot check (M5-15).
// See docs/specifications/M1-teams.md ("Team documents").
//
// Files are protected: downloading one needs a file token, and PocketBase then checks the
// collection's view rule, so the files are exactly as visible as the records.

// Same helpers as 1763700000_scoped_access_rules.js (migrations cannot share code).
const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const anyRole = (e) => `(${MINE} && ${R}.event ?= ${e})`
const isManager = (e) => `(${MINE} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`
const unchanged = (field) =>
  `(@request.body.${field}:isset = false || @request.body.${field} = ${field})`

const MAX_SIZE = 20 * 1024 * 1024
const MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

migrate(
  (app) => {
    const teams = app.findCollectionByNameOrId('teams')
    const users = app.findCollectionByNameOrId('users')
    const E = 'team.event'
    const list = `${AUTH} && (team.coach = @request.auth.id || ${IS_ADMIN} || ${anyRole(E)})`
    const manage = `${AUTH} && (${IS_ADMIN} || ${isManager(E)}) && ${E}.status != "archived"`
    const documents = new Collection({
      type: 'base',
      name: 'team_documents',
      listRule: list,
      viewRule: list,
      createRule: manage,
      // The file and title can be replaced; the team cannot change.
      updateRule: `${manage} && ${unchanged('team')} && @request.body.uploaded_by:isset = false`,
      deleteRule: manage,
      fields: [
        {
          type: 'relation',
          name: 'team',
          required: true,
          collectionId: teams.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { type: 'text', name: 'title', required: true, max: 100 },
        {
          type: 'file',
          name: 'file',
          required: true,
          maxSelect: 1,
          maxSize: MAX_SIZE,
          mimeTypes: MIME_TYPES,
          protected: true,
        },
        // Set by the server to the uploading user (hooks/team_documents.pb.js).
        { type: 'relation', name: 'uploaded_by', collectionId: users.id, maxSelect: 1 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX `idx_team_documents_team` ON `team_documents` (`team`)'],
    })
    app.save(documents)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('team_documents'))
  },
)
