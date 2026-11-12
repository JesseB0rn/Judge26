/// <reference path="../pb_data/types.d.ts" />

// M8-B: judge invitations. See docs/specifications/M8-invitations.md.
//
// - invitations: one per invited user and event. Created, resent, revoked and accepted only by
//   the routes in hooks/invitations.pb.js. The link token is stored as a SHA-256 hash (hidden), so
//   neither the API nor a database dump reveals a usable link.
// - mail templates `invitation` (new account: set a password) and `event_access` (existing
//   account: you were added to an event), in every language.

const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const MINE = `${R}.user ?= @request.auth.id`
const IS_ADMIN = `(${MINE} && ${R}.role ?= "admin")`
const isManager = (e) => `(${MINE} && ${R}.event ?= ${e} && ${R}.role ?= "event_manager")`

const p = (...lines) => lines.map((l) => `<p>${l}</p>`).join('\n')
const button = (label) =>
  `<p><a class="btn" href="{{action_url}}" target="_blank" rel="noopener">${label}</a></p>`

// Variables: see TEMPLATE_VARIABLES in hooks/lib/mail.js.
const TEMPLATES = {
  invitation: {
    en: {
      name: 'Invitation',
      subject: 'You are invited to {{event_name}}',
      body: [
        p(
          'Hello {{name}},',
          '{{inviter_name}} invites you to <strong>{{event_name}}</strong> as {{role_name}}. Choose a password to activate your {{app_name}} account:',
        ),
        button('Accept invitation'),
        p('The link is valid until {{expires_on}} and can be used once.'),
        p('Thanks,<br/>the {{app_name}} team'),
      ].join('\n'),
    },
    de: {
      name: 'Einladung',
      subject: 'Einladung zu {{event_name}}',
      body: [
        p(
          'Hallo {{name}}',
          '{{inviter_name}} lädt Sie als {{role_name}} zu <strong>{{event_name}}</strong> ein. Wählen Sie ein Passwort, um Ihr {{app_name}}-Konto zu aktivieren:',
        ),
        button('Einladung annehmen'),
        p('Der Link ist bis am {{expires_on}} gültig und kann einmal verwendet werden.'),
        p('Freundliche Grüsse<br/>das {{app_name}}-Team'),
      ].join('\n'),
    },
    fr: {
      name: 'Invitation',
      subject: 'Invitation à {{event_name}}',
      body: [
        p(
          'Bonjour {{name}},',
          '{{inviter_name}} vous invite à <strong>{{event_name}}</strong> en tant que {{role_name}}. Choisissez un mot de passe pour activer votre compte {{app_name}} :',
        ),
        button('Accepter l’invitation'),
        p('Le lien est valable jusqu’au {{expires_on}} et ne peut être utilisé qu’une fois.'),
        p('Meilleures salutations,<br/>l’équipe {{app_name}}'),
      ].join('\n'),
    },
    it: {
      name: 'Invito',
      subject: 'Invito a {{event_name}}',
      body: [
        p(
          'Buongiorno {{name}},',
          '{{inviter_name}} la invita a <strong>{{event_name}}</strong> come {{role_name}}. Scelga una password per attivare il suo account {{app_name}}:',
        ),
        button('Accetta l’invito'),
        p('Il link è valido fino al {{expires_on}} e può essere usato una sola volta.'),
        p('Cordiali saluti,<br/>il team di {{app_name}}'),
      ].join('\n'),
    },
  },
  event_access: {
    en: {
      name: 'Added to an event',
      subject: 'You were added to {{event_name}}',
      body: [
        p(
          'Hello {{name}},',
          '{{inviter_name}} added you to <strong>{{event_name}}</strong> as {{role_name}}. Sign in with your existing account:',
        ),
        button('Open {{app_name}}'),
        p('Thanks,<br/>the {{app_name}} team'),
      ].join('\n'),
    },
    de: {
      name: 'Zu einem Anlass hinzugefügt',
      subject: 'Sie wurden zu {{event_name}} hinzugefügt',
      body: [
        p(
          'Hallo {{name}}',
          '{{inviter_name}} hat Sie als {{role_name}} zu <strong>{{event_name}}</strong> hinzugefügt. Melden Sie sich mit Ihrem bestehenden Konto an:',
        ),
        button('{{app_name}} öffnen'),
        p('Freundliche Grüsse<br/>das {{app_name}}-Team'),
      ].join('\n'),
    },
    fr: {
      name: 'Ajout à un événement',
      subject: 'Vous avez été ajouté·e à {{event_name}}',
      body: [
        p(
          'Bonjour {{name}},',
          '{{inviter_name}} vous a ajouté·e à <strong>{{event_name}}</strong> en tant que {{role_name}}. Connectez-vous avec votre compte existant :',
        ),
        button('Ouvrir {{app_name}}'),
        p('Meilleures salutations,<br/>l’équipe {{app_name}}'),
      ].join('\n'),
    },
    it: {
      name: 'Aggiunta a un evento',
      subject: 'È stato aggiunto a {{event_name}}',
      body: [
        p(
          'Buongiorno {{name}},',
          '{{inviter_name}} l’ha aggiunta a <strong>{{event_name}}</strong> come {{role_name}}. Acceda con il suo account esistente:',
        ),
        button('Apri {{app_name}}'),
        p('Cordiali saluti,<br/>il team di {{app_name}}'),
      ].join('\n'),
    },
  },
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const events = app.findCollectionByNameOrId('events')
    const read = `${AUTH} && (${IS_ADMIN} || ${isManager('event')})`
    const invitations = new Collection({
      type: 'base',
      name: 'invitations',
      listRule: read,
      viewRule: read,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'user',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'relation',
          name: 'event',
          required: true,
          collectionId: events.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          type: 'select',
          name: 'role',
          required: true,
          maxSelect: 1,
          values: ['event_manager', 'head_judge', 'judge'],
        },
        { type: 'text', name: 'token_hash', hidden: true, max: 64 },
        { type: 'date', name: 'expires_at' },
        { type: 'date', name: 'sent_at' },
        { type: 'date', name: 'accepted_at' },
        { type: 'date', name: 'revoked_at' },
        { type: 'relation', name: 'invited_by', collectionId: users.id, maxSelect: 1 },
        { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_invitations_user_event` ON `invitations` (`user`, `event`)',
        'CREATE INDEX `idx_invitations_token` ON `invitations` (`token_hash`)',
        'CREATE INDEX `idx_invitations_event` ON `invitations` (`event`)',
      ],
    })
    app.save(invitations)

    const templates = app.findCollectionByNameOrId('mail_templates')
    Object.keys(TEMPLATES).forEach((key) => {
      Object.keys(TEMPLATES[key]).forEach((language) => {
        const record = new Record(templates)
        record.load({ key, language, enabled: true, ...TEMPLATES[key][language] })
        app.save(record)
      })
    })
  },
  (app) => {
    app
      .findRecordsByFilter('mail_templates', 'key = "invitation" || key = "event_access"', '', 0, 0)
      .forEach((record) => app.delete(record))
    app.delete(app.findCollectionByNameOrId('invitations'))
  },
)
