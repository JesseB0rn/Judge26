import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseCompile } from '@intlify/message-compiler'
import { LOCALE_CODES } from '../locales'

// Checks the message files themselves (all languages, not only the one tests run in).
const root = join(__dirname, '..', 'locales')
type Tree = { [key: string]: string | Tree }

function load(locale: string): Record<string, string> {
  const flat: Record<string, string> = {}
  const walk = (tree: Tree, prefix: string) => {
    for (const [key, value] of Object.entries(tree)) {
      if (typeof value === 'string') flat[prefix + key] = value
      else walk(value, `${prefix}${key}.`)
    }
  }
  for (const file of readdirSync(join(root, locale)).filter((f) => f.endsWith('.json'))) {
    walk(JSON.parse(readFileSync(join(root, locale, file), 'utf8')), `${file.slice(0, -5)}.`)
  }
  return flat
}

const messages = Object.fromEntries(LOCALE_CODES.map((l) => [l, load(l)]))
const english = messages.en!

/** Named placeholders of a message: `{count}` → count. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*\}/g)].map((m) => m[1]!).sort()
}

describe('message files', () => {
  it.each(LOCALE_CODES.filter((l) => l !== 'en'))('%s has exactly the English keys', (locale) => {
    const keys = Object.keys(messages[locale]!)
    expect(
      keys.filter((k) => !(k in english)),
      'keys not in English',
    ).toEqual([])
    expect(
      Object.keys(english).filter((k) => !(k in messages[locale]!)),
      'missing',
    ).toEqual([])
  })

  it.each(LOCALE_CODES)('%s messages compile', (locale) => {
    for (const [key, message] of Object.entries(messages[locale]!)) {
      const errors: string[] = []
      baseCompile(message, { onError: (e) => errors.push(e.message) })
      expect(errors, `${locale}: ${key}`).toEqual([])
    }
  })

  it.each(LOCALE_CODES.filter((l) => l !== 'en'))('%s uses the English placeholders', (locale) => {
    for (const [key, message] of Object.entries(messages[locale]!)) {
      expect(new Set(placeholders(message)), `${locale}: ${key}`).toEqual(
        new Set(placeholders(english[key]!)),
      )
    }
  })

  it.each(LOCALE_CODES.filter((l) => l !== 'en'))('%s has the English plural forms', (locale) => {
    for (const [key, message] of Object.entries(messages[locale]!)) {
      expect(message.split(' | ').length, `${locale}: ${key}`).toBe(
        english[key]!.split(' | ').length,
      )
    }
  })

  it('Swiss German uses ss, not ß', () => {
    expect(Object.entries(messages.de!).filter(([, m]) => m.includes('ß'))).toEqual([])
  })

  it.each(LOCALE_CODES)('%s has no empty messages', (locale) => {
    expect(Object.entries(messages[locale]!).filter(([, m]) => !m.trim())).toEqual([])
  })
})
