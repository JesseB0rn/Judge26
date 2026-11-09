import { validateRuleset, type CompiledRuleset, type Issue } from '@judge26/scoring-engine'

export interface ParsedRuleset {
  definition?: unknown
  syntaxError?: string
  issues: Issue[]
  ruleset?: CompiledRuleset
}

/** Parses and validates ruleset JSON text from the editor. */
export function parseRuleset(text: string): ParsedRuleset {
  let definition: unknown
  try {
    definition = JSON.parse(text)
  } catch (e) {
    return { syntaxError: (e as Error).message, issues: [] }
  }
  const result = validateRuleset(definition)
  return result.ok
    ? { definition, issues: [], ruleset: result.ruleset }
    : { definition, issues: result.issues }
}

export const toEditorText = (definition: unknown) => JSON.stringify(definition ?? {}, null, 2)
