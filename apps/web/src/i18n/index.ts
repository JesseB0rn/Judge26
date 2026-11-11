import { computed, watch } from 'vue'
import { createI18n } from 'vue-i18n'
import {
  FALLBACK_LOCALE,
  LOCALE_CODES,
  LOCALES,
  isLocale,
  matchLocale,
  type Locale,
} from './locales'
import type { MessageSchema } from './schema'

export { LOCALES, LOCALE_CODES, isLocale, type Locale } from './locales'

/**
 * Every language is bundled (precompiled by @intlify/unplugin-vue-i18n): judges score offline
 * (M5), so switching languages must not depend on loading another chunk.
 * Files are `locales/<language>/<module>.json`; all languages have the same keys
 * (checked by src/i18n/__tests__/messages.spec.ts).
 */
const files = import.meta.glob<MessageSchema[keyof MessageSchema]>('./locales/*/*.json', {
  eager: true,
  import: 'default',
})

function collect(): Record<Locale, MessageSchema> {
  const messages = Object.fromEntries(LOCALE_CODES.map((l) => [l, {}])) as Record<
    Locale,
    Record<string, unknown>
  >
  for (const [path, content] of Object.entries(files)) {
    const [, locale, module] = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? []
    if (isLocale(locale) && module) messages[locale][module] = content
  }
  return messages as unknown as Record<Locale, MessageSchema>
}

const STORAGE_KEY = 'judge26.locale'

function storedLocale(): Locale | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLocale(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** The language chosen on this device, else the browser's, else English. */
export function initialLocale(): Locale {
  const browser =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return storedLocale() ?? matchLocale(browser) ?? FALLBACK_LOCALE
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: collect(),
  // Missing keys are caught by the type checker and the message tests, not at runtime.
  missingWarn: false,
  fallbackWarn: false,
})

const composer = i18n.global

/** Every message key ("shell.nav.events", …); a typo is a type error. */
export type MessageKey = Leaves<MessageSchema>
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type MessageParams = Record<string, unknown>

/**
 * Translates a message key. Usable in templates, scripts and plain modules; reactive to the
 * language when called during rendering or in a `computed`. With a count, picks the plural
 * form ("no teams | one team | {count} teams") and provides `{count}`.
 */
export function t(key: MessageKey, params?: MessageParams): string
export function t(key: MessageKey, count: number, params?: MessageParams): string
export function t(key: MessageKey, a?: number | MessageParams, b?: MessageParams): string {
  if (typeof a === 'number') return composer.t(key, { count: a, n: a, ...b }, a)
  return composer.t(key, a ?? {})
}

/** Whether a message key exists (used to translate server error codes when known). */
export function te(key: string): key is MessageKey {
  return composer.te(key)
}

/** The current language (reactive). */
export const locale = computed<Locale>(() => composer.locale.value)

/** BCP 47 tag of the current language, for `Intl` and `toLocale*String` (de-CH, fr-CH, …). */
export function localeTag(): string {
  return LOCALES[composer.locale.value].tag
}

/** Switches the language and remembers it on this device. */
export function setLocale(next: Locale) {
  composer.locale.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this page load.
  }
}

watch(
  composer.locale,
  (value) => {
    if (typeof document !== 'undefined') document.documentElement.lang = LOCALES[value].tag
  },
  { immediate: true },
)

/**
 * A label lookup (`LABELS[status]`, `Object.entries(LABELS)`) whose values are translated when
 * read, so they follow the current language.
 */
export function translatedLabels<K extends string>(
  keys: readonly K[],
  label: (key: K) => string,
): Readonly<Record<K, string>> {
  const labels = {} as Record<K, string>
  for (const key of keys)
    Object.defineProperty(labels, key, { get: () => label(key), enumerable: true })
  return labels
}
