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

interface HasGameRule {
  game_rule?: string
}

/** Latest published version of a game rule (`versions` may mix game rules). */
export function activeVersion<T extends HasGameRule & { status: string; version: number }>(
  versions: T[],
  gameRuleId: string | undefined,
): T | undefined {
  return versions
    .filter((v) => v.status === 'published' && (!gameRuleId || v.game_rule === gameRuleId))
    .reduce<T | undefined>((best, v) => (!best || v.version > best.version ? v : best), undefined)
}

/** The game rule a round is scored with: its own, else the category's only one ("" if none). */
export function gameRuleIdForRound(round: HasGameRule, rules: { id: string }[]): string {
  if (round.game_rule) return round.game_rule
  return rules.length === 1 ? rules[0]!.id : ''
}

/**
 * Active ruleset version for a round. Without any game rule (older data) the category's latest
 * published version is used; with several and none chosen there is no ruleset.
 */
export function activeVersionForRound<T extends HasGameRule & { status: string; version: number }>(
  round: HasGameRule,
  rules: { id: string }[],
  versions: T[],
): T | undefined {
  const ruleId = gameRuleIdForRound(round, rules)
  if (!ruleId && rules.length) return undefined
  return activeVersion(versions, ruleId)
}
