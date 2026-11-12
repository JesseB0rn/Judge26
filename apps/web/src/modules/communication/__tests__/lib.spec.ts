import { describe, expect, it } from 'vitest'
import { escapeHtml, previewDocument, renderTemplate, unknownVariables } from '../lib'

describe('communication lib', () => {
  it('replaces variables, tolerating spaces and missing values', () => {
    expect(
      renderTemplate(
        'Hi {{ contact_name }}, {{team_name}}{{missing}}!',
        { contact_name: 'Ada', team_name: 'Bots' },
        false,
      ),
    ).toBe('Hi Ada, Bots!')
  })

  it('escapes values in HTML, except the server-rendered schedule', () => {
    const values = { team_name: '<b>"Bots" & co</b>', schedule: '<ul><li>R1</li></ul>' }
    expect(renderTemplate('{{team_name}} {{schedule}}', values, true)).toBe(
      '&lt;b&gt;&quot;Bots&quot; &amp; co&lt;/b&gt; <ul><li>R1</li></ul>',
    )
    // Subjects are plain text.
    expect(renderTemplate('{{team_name}}', values, false)).toBe('<b>"Bots" & co</b>')
  })

  it('lists unknown variables once, in order', () => {
    expect(unknownVariables('{{a}} {{team_name}} {{b}} {{a}}', ['team_name'])).toEqual(['a', 'b'])
    expect(unknownVariables('no variables', [])).toEqual([])
  })

  it('escapes quotes and wraps previews in a document', () => {
    expect(escapeHtml(`'`)).toBe('&#39;')
    expect(previewDocument('<p>x</p>')).toMatch(
      /^<!doctype html>.*<body><p>x<\/p><\/body><\/html>$/,
    )
  })
})
