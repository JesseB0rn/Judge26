import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { formatNumber } from '@/shared/format'
import { initialLocale, localeTag, locale, setLocale, t, translatedLabels } from '..'
import { matchLocale } from '../locales'

describe('i18n', () => {
  afterEach(() => {
    setLocale('en')
    localStorage.clear()
  })

  it('matches browser languages to supported ones (no Romansh)', () => {
    expect(matchLocale(['rm-CH', 'fr-CH', 'de'])).toBe('fr')
    expect(matchLocale(['de-AT'])).toBe('de')
    expect(matchLocale(['rm', 'es'])).toBeUndefined()
  })

  it('remembers the chosen language on the device and sets the page language', async () => {
    setLocale('it')
    await nextTick()
    expect(locale.value).toBe('it')
    expect(document.documentElement.lang).toBe('it-CH')
    expect(initialLocale()).toBe('it')
  })

  it('translates with plural forms and parameters', () => {
    expect(t('teams.import.submit', 1)).toBe('Import one team')
    expect(t('teams.import.submit', 3)).toBe('Import 3 teams')
    setLocale('de')
    expect(t('teams.import.submit', 3)).toBe('3 Teams importieren')
    expect(t('auth.forgot.sent', { email: 'a@b.ch' })).toContain('a@b.ch')
  })

  it('label lookups follow the current language', () => {
    const labels = translatedLabels(['draft'] as const, (s) => t(`events.status.${s}`))
    expect(labels.draft).toBe('Draft')
    setLocale('fr')
    expect(labels.draft).toBe('Brouillon')
    expect(Object.values(labels)).toEqual(['Brouillon'])
  })

  it('formats numbers the Swiss way for the current language', () => {
    setLocale('de')
    expect(localeTag()).toBe('de-CH')
    // Swiss grouping (apostrophe; the exact glyph depends on the ICU data).
    expect(formatNumber(1234.5)).toMatch(/^1['’]234\.5$/)
  })
})
