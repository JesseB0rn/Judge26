/**
 * Languages the application ships in. Every build contains all of them (messages are
 * precompiled by the build); each user picks one. See docs/specifications/i18n.md.
 */
export const LOCALES = {
  de: { tag: 'de-CH', name: 'Deutsch' },
  fr: { tag: 'fr-CH', name: 'Français' },
  it: { tag: 'it-CH', name: 'Italiano' },
  en: { tag: 'en-CH', name: 'English' },
} as const

export type Locale = keyof typeof LOCALES

export const LOCALE_CODES = Object.keys(LOCALES) as Locale[]

/** Used when neither the user nor the browser prefers a supported language. */
export const FALLBACK_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.hasOwn(LOCALES, value)
}

/** First supported language in a browser preference list ("fr-CH", "de", …). */
export function matchLocale(preferences: readonly string[]): Locale | undefined {
  for (const preference of preferences) {
    const language = preference.toLowerCase().split('-')[0]
    if (isLocale(language)) return language
  }
  return undefined
}
