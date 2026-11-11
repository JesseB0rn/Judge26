/// <reference path="../../pb_data/types.d.ts" />

// Server-side texts that are not editable templates: parts of the schedule in notification
// emails. Mirrors communication.schedule.* in apps/web/src/i18n/locales (the delivery log shows
// the same lines). See docs/specifications/i18n.md.

const LANGUAGES = ['de', 'fr', 'it', 'en']
const FALLBACK = 'en'

const MESSAGES = {
  en: {
    attempt: '{round} (attempt {attempt})',
    from: 'from {time}',
    table: 'table {table}, position {position}',
    noTable: 'table not assigned yet',
    check: 'robot check {day}',
    noGames: 'No games are currently scheduled for this team.',
    coach: 'coach',
  },
  de: {
    attempt: '{round} (Versuch {attempt})',
    from: 'ab {time}',
    table: 'Tisch {table}, Position {position}',
    noTable: 'Tisch noch nicht zugeteilt',
    check: 'Roboterkontrolle {day}',
    noGames: 'Für dieses Team sind zurzeit keine Läufe geplant.',
    coach: 'Coach',
  },
  fr: {
    attempt: '{round} (essai {attempt})',
    from: 'dès {time}',
    table: 'table {table}, position {position}',
    noTable: 'table pas encore attribuée',
    check: 'contrôle du robot {day}',
    noGames: 'Aucune manche n’est actuellement planifiée pour cette équipe.',
    coach: 'coach',
  },
  it: {
    attempt: '{round} (tentativo {attempt})',
    from: 'dalle {time}',
    table: 'tavolo {table}, posizione {position}',
    noTable: 'tavolo non ancora assegnato',
    check: 'controllo del robot {day}',
    noGames: 'Al momento non è pianificata nessuna manche per questa squadra.',
    coach: 'coach',
  },
}

/** A supported language, or the fallback (English). */
function language(value) {
  return LANGUAGES.indexOf(value) === -1 ? FALLBACK : value
}

function t(lang, key, params) {
  const text = MESSAGES[language(lang)][key] || MESSAGES[FALLBACK][key] || key
  return text.replace(/\{(\w+)\}/g, (_, name) =>
    params && params[name] !== undefined ? String(params[name]) : '',
  )
}

/**
 * Language of the person behind an email address: the account's language (users.language),
 * else `fallback`, else English.
 */
function languageOf(app, options) {
  const fromRecord = (record) => (record ? record.getString('language') : '')
  let found = ''
  if (options.userId) {
    try {
      found = fromRecord(app.findRecordById('users', options.userId))
    } catch (_) {
      // Deleted user: try the email address.
    }
  }
  if (!found && options.email) {
    try {
      found = fromRecord(app.findAuthRecordByEmail('users', options.email))
    } catch (_) {
      // No account with this address (e.g. a team registered by staff).
    }
  }
  return language(found || options.fallback)
}

module.exports = { LANGUAGES, FALLBACK, language, languageOf, t }
