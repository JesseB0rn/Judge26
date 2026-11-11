# ADR 0009: Internationalization

- **Status:** accepted
- **Date:** 2026-11-11

## Context

The Swiss WRO association tests Judge26 with coaches, judges and organizers from all language
regions. The app must be usable in German, French and Italian, and in English (not Romansh).
Translations are part of a release: nobody edits them at runtime. People in one event speak
different languages, so the language is a per-user choice, not a per-deployment setting.

## Decisions

1. **vue-i18n with build-time compiled messages.** `@intlify/unplugin-vue-i18n` precompiles the
   JSON message files, so the bundle needs no message compiler and no `eval`. vue-i18n brings
   pluralization and named parameters; `Intl` handles dates and numbers.
2. **All languages in every bundle.** Judges score offline (M5); switching language must not need
   another download. The messages are small compared to the app.
3. **One typed `t()`** (`src/i18n/index.ts`), importable in templates, scripts and plain modules,
   instead of `$t`/`useI18n`. Keys are typed from the English files, so a typo is a type error.
   Label maps (`STATUS_LABELS[...]`) become getters (`translatedLabels`) so they follow a language
   switch without touching their call sites.
4. **English defines the keys; a test checks the others** (same keys, same placeholders and plural
   forms, messages compile, no `ß`). A lint rule (`@intlify/vue-i18n/no-raw-text`) rejects
   untranslated text in templates.
5. **The server sends codes, the client translates.** PocketBase hooks run in a pool of JS VMs
   without request-scoped state, so translating in hooks would mean passing the language through
   every library function. Instead errors carry stable codes (`data._error`, field error codes,
   issue and health-check codes) next to the English message; the web app translates known codes
   and shows the English text otherwise.
6. **Emails are the exception**: they are rendered on the server in the recipient's language
   (`users.language`). Templates stay editable, now one per notification and language; account
   emails (verification, password reset) moved into the same templates so they are translated and
   editable too. The few non-template texts (schedule lines) are in `hooks/lib/i18n.js`.

## Consequences

- Adding a text means adding it to four files; the message test fails until all exist.
- New server messages need a code to be translated; without one they appear in English.
- Admins maintain four versions of every email template.
- The initial German, French and Italian texts were drafted with an AI assistant; native speakers
  of the association should review them before the user test.
