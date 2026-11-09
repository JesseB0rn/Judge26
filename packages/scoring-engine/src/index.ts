export * from './types'
export { validateRuleset, compileRuleset, RulesetValidationError, conditionRefs } from './validate'
export type { CompiledRuleset, ValidationResult } from './validate'
export { evaluate, valueProblem } from './evaluate'
export { canonicalJson, fingerprint } from './fingerprint'
export { formatUnits, fromUnits, toUnits } from './decimal'
export { EXAMPLE_RULESET } from './example'
export { updateValue, pruneInactive } from './sheet'

import { evaluate } from './evaluate'
import { compileRuleset } from './validate'
import type { EvaluationMode, ScoreValues } from './types'

/** Validates the definition and evaluates the values in one step. */
export function evaluateDefinition(
  definition: unknown,
  values: ScoreValues,
  options: { mode?: EvaluationMode } = {},
) {
  return evaluate(compileRuleset(definition), values, options)
}
