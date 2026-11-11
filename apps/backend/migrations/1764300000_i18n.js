/// <reference path="../pb_data/types.d.ts" />

// Languages (docs/specifications/i18n.md): the app ships in German, French, Italian and English;
// every user picks one.
// - users.language: the user's choice, saved by the web app. Emails to a user use it.
// - mail_templates.language: each notification exists once per language (key + language
//   unique); admins edit every language. Existing templates are the English ones.
// - auth_verification / auth_password_reset: the account emails, sent by PocketBase, are
//   rendered from these templates in the user's language (hooks/mail.pb.js).

const LANGUAGES = ['de', 'fr', 'it', 'en']
const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const R = '@request.auth.role_assignments_via_user'
const IS_ADMIN = `(${R}.user ?= @request.auth.id && ${R}.role ?= "admin")`

const p = (...lines) => lines.map((l) => `<p>${l}</p>`).join('\n')
const button = (label) =>
  `<p><a class="btn" href="{{action_url}}" target="_blank" rel="noopener">${label}</a></p>`

// Variables are written as {{name}}; see hooks/lib/mail.js (TEMPLATE_VARIABLES).
const TEMPLATES = {
  registration_submitted: {
    de: {
      name: 'Anmeldung erhalten',
      subject: 'Anmeldung erhalten: {{team_name}}',
      body: p(
        'Hallo {{coach_name}}',
        'Wir haben die Anmeldung von <strong>{{team_name}}</strong> für {{category_name}} am Anlass {{event_name}} erhalten. Die Organisation prüft sie und meldet sich bei Ihnen.',
        '<a href="{{team_url}}">Anmeldung ansehen</a>',
      ),
    },
    fr: {
      name: 'Inscription reçue',
      subject: 'Inscription reçue : {{team_name}}',
      body: p(
        'Bonjour {{coach_name}},',
        'Nous avons bien reçu l’inscription de <strong>{{team_name}}</strong> en {{category_name}} pour {{event_name}}. L’organisation va l’examiner et vous tiendra informé·e.',
        '<a href="{{team_url}}">Voir l’inscription</a>',
      ),
    },
    it: {
      name: 'Iscrizione ricevuta',
      subject: 'Iscrizione ricevuta: {{team_name}}',
      body: p(
        'Buongiorno {{coach_name}},',
        'abbiamo ricevuto l’iscrizione di <strong>{{team_name}}</strong> in {{category_name}} per {{event_name}}. L’organizzazione la esaminerà e le farà sapere.',
        '<a href="{{team_url}}">Vedi l’iscrizione</a>',
      ),
    },
  },
  registration_approved: {
    de: {
      name: 'Anmeldung genehmigt',
      subject: 'Anmeldung genehmigt: {{team_name}}',
      body: p(
        'Hallo {{coach_name}}',
        'Die Anmeldung von <strong>{{team_name}}</strong> für {{category_name}} am Anlass {{event_name}} wurde genehmigt.',
        '{{review_note}}',
        '<a href="{{team_url}}">Anmeldung ansehen</a>',
      ),
    },
    fr: {
      name: 'Inscription acceptée',
      subject: 'Inscription acceptée : {{team_name}}',
      body: p(
        'Bonjour {{coach_name}},',
        'L’inscription de <strong>{{team_name}}</strong> en {{category_name}} pour {{event_name}} a été acceptée.',
        '{{review_note}}',
        '<a href="{{team_url}}">Voir l’inscription</a>',
      ),
    },
    it: {
      name: 'Iscrizione approvata',
      subject: 'Iscrizione approvata: {{team_name}}',
      body: p(
        'Buongiorno {{coach_name}},',
        'l’iscrizione di <strong>{{team_name}}</strong> in {{category_name}} per {{event_name}} è stata approvata.',
        '{{review_note}}',
        '<a href="{{team_url}}">Vedi l’iscrizione</a>',
      ),
    },
  },
  registration_rejected: {
    de: {
      name: 'Anmeldung abgelehnt',
      subject: 'Anmeldung nicht angenommen: {{team_name}}',
      body: p(
        'Hallo {{coach_name}}',
        'Die Anmeldung von <strong>{{team_name}}</strong> für {{category_name}} am Anlass {{event_name}} konnte nicht angenommen werden.',
        'Begründung: {{review_note}}',
        'Sie können die Anmeldung korrigieren und erneut einreichen: <a href="{{team_url}}">Anmeldung öffnen</a>.',
      ),
    },
    fr: {
      name: 'Inscription refusée',
      subject: 'Inscription non acceptée : {{team_name}}',
      body: p(
        'Bonjour {{coach_name}},',
        'L’inscription de <strong>{{team_name}}</strong> en {{category_name}} pour {{event_name}} n’a pas pu être acceptée.',
        'Motif : {{review_note}}',
        'Vous pouvez corriger l’inscription et la soumettre à nouveau : <a href="{{team_url}}">ouvrir l’inscription</a>.',
      ),
    },
    it: {
      name: 'Iscrizione respinta',
      subject: 'Iscrizione non accettata: {{team_name}}',
      body: p(
        'Buongiorno {{coach_name}},',
        'l’iscrizione di <strong>{{team_name}}</strong> in {{category_name}} per {{event_name}} non ha potuto essere accettata.',
        'Motivo: {{review_note}}',
        'Può correggere l’iscrizione e inviarla di nuovo: <a href="{{team_url}}">apri l’iscrizione</a>.',
      ),
    },
  },
  schedule_changed: {
    de: {
      name: 'Zeitplan-Update',
      subject: 'Zeitplan für {{team_name}} am Anlass {{event_name}}',
      body: [
        p(
          'Hallo {{coach_name}}',
          'Das ist der aktuelle Zeitplan von <strong>{{team_name}}</strong>:',
        ),
        '{{schedule}}',
        p('{{message}}', '<a href="{{schedule_url}}">Vollständiger Zeitplan des Anlasses</a>'),
      ].join('\n'),
    },
    fr: {
      name: 'Mise à jour de l’horaire',
      subject: 'Horaire de {{team_name}} pour {{event_name}}',
      body: [
        p('Bonjour {{coach_name}},', 'voici l’horaire actuel de <strong>{{team_name}}</strong> :'),
        '{{schedule}}',
        p('{{message}}', '<a href="{{schedule_url}}">Horaire complet de l’événement</a>'),
      ].join('\n'),
    },
    it: {
      name: 'Aggiornamento del programma',
      subject: 'Programma di {{team_name}} per {{event_name}}',
      body: [
        p(
          'Buongiorno {{coach_name}},',
          'ecco il programma attuale di <strong>{{team_name}}</strong>:',
        ),
        '{{schedule}}',
        p('{{message}}', '<a href="{{schedule_url}}">Programma completo dell’evento</a>'),
      ].join('\n'),
    },
  },
  auth_verification: {
    en: {
      name: 'Confirm email address',
      subject: 'Confirm your email address for {{app_name}}',
      body: [
        p(
          'Hello {{name}},',
          'thank you for registering with {{app_name}}. Please confirm your email address:',
        ),
        button('Confirm email address'),
        p('Thanks,<br/>the {{app_name}} team'),
      ].join('\n'),
    },
    de: {
      name: 'E-Mail-Adresse bestätigen',
      subject: 'Bestätigen Sie Ihre E-Mail-Adresse für {{app_name}}',
      body: [
        p(
          'Hallo {{name}}',
          'Danke für Ihre Registrierung bei {{app_name}}. Bitte bestätigen Sie Ihre E-Mail-Adresse:',
        ),
        button('E-Mail-Adresse bestätigen'),
        p('Freundliche Grüsse<br/>Ihr {{app_name}}-Team'),
      ].join('\n'),
    },
    fr: {
      name: 'Confirmer l’adresse e-mail',
      subject: 'Confirmez votre adresse e-mail pour {{app_name}}',
      body: [
        p(
          'Bonjour {{name}},',
          'merci de vous être inscrit·e sur {{app_name}}. Veuillez confirmer votre adresse e-mail :',
        ),
        button('Confirmer l’adresse e-mail'),
        p('Meilleures salutations,<br/>l’équipe {{app_name}}'),
      ].join('\n'),
    },
    it: {
      name: 'Conferma dell’indirizzo e-mail',
      subject: 'Confermi il suo indirizzo e-mail per {{app_name}}',
      body: [
        p(
          'Buongiorno {{name}},',
          'grazie per essersi registrato/a su {{app_name}}. Confermi il suo indirizzo e-mail:',
        ),
        button('Conferma l’indirizzo e-mail'),
        p('Cordiali saluti,<br/>il team di {{app_name}}'),
      ].join('\n'),
    },
  },
  auth_password_reset: {
    en: {
      name: 'Reset password',
      subject: 'Reset your {{app_name}} password',
      body: [
        p('Hello {{name}},', 'click the button below to choose a new password.'),
        button('Reset password'),
        p("<i>If you didn't ask to reset your password, you can ignore this email.</i>"),
        p('Thanks,<br/>the {{app_name}} team'),
      ].join('\n'),
    },
    de: {
      name: 'Passwort zurücksetzen',
      subject: 'Ihr Passwort für {{app_name}} zurücksetzen',
      body: [
        p('Hallo {{name}}', 'Klicken Sie auf die Schaltfläche, um ein neues Passwort zu wählen.'),
        button('Passwort zurücksetzen'),
        p('<i>Wenn Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren.</i>'),
        p('Freundliche Grüsse<br/>Ihr {{app_name}}-Team'),
      ].join('\n'),
    },
    fr: {
      name: 'Réinitialiser le mot de passe',
      subject: 'Réinitialisez votre mot de passe {{app_name}}',
      body: [
        p(
          'Bonjour {{name}},',
          'cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.',
        ),
        button('Réinitialiser le mot de passe'),
        p(
          '<i>Si vous n’avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail.</i>',
        ),
        p('Meilleures salutations,<br/>l’équipe {{app_name}}'),
      ].join('\n'),
    },
    it: {
      name: 'Reimpostare la password',
      subject: 'Reimposti la sua password di {{app_name}}',
      body: [
        p(
          'Buongiorno {{name}},',
          'clicchi sul pulsante qui sotto per scegliere una nuova password.',
        ),
        button('Reimposta la password'),
        p('<i>Se non ha richiesto di reimpostare la password, può ignorare questa e-mail.</i>'),
        p('Cordiali saluti,<br/>il team di {{app_name}}'),
      ].join('\n'),
    },
  },
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(
      new SelectField({ name: 'language', maxSelect: 1, values: LANGUAGES, required: false }),
    )
    app.save(users)

    const templates = app.findCollectionByNameOrId('mail_templates')
    templates.fields.add(
      new SelectField({ name: 'language', maxSelect: 1, values: LANGUAGES, required: false }),
    )
    templates.indexes = [
      'CREATE UNIQUE INDEX `idx_mail_templates_key` ON `mail_templates` (`key`, `language`)',
    ]
    // Neither the key nor the language of a template can be changed.
    templates.updateRule = `${AUTH} && ${IS_ADMIN} && (@request.body.key:isset = false || @request.body.key = key) && (@request.body.language:isset = false || @request.body.language = language)`
    app.save(templates)

    app.findAllRecords('mail_templates').forEach((record) => {
      record.set('language', 'en')
      app.save(record)
    })
    Object.keys(TEMPLATES).forEach((key) => {
      Object.keys(TEMPLATES[key]).forEach((language) => {
        const record = new Record(templates)
        record.load({ key, language, enabled: true, ...TEMPLATES[key][language] })
        app.save(record)
      })
    })
  },
  (app) => {
    const templates = app.findCollectionByNameOrId('mail_templates')
    app
      .findRecordsByFilter('mail_templates', 'language != "en" || key ~ "auth_"', '', 0, 0)
      .forEach((record) => app.delete(record))
    templates.fields.removeByName('language')
    templates.indexes = ['CREATE UNIQUE INDEX `idx_mail_templates_key` ON `mail_templates` (`key`)']
    templates.updateRule = `${AUTH} && ${IS_ADMIN} && (@request.body.key:isset = false || @request.body.key = key)`
    app.save(templates)

    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('language')
    app.save(users)
  },
)
