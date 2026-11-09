<script setup lang="ts">
import { computed } from 'vue'
import {
  updateValue,
  type CompiledRuleset,
  type EvaluationResult,
  type Explanation,
  type ScoreValue,
  type ScoreValues,
} from '@judge26/scoring-engine'
import ScoreNodeField from './ScoreNodeField.vue'

/**
 * Score sheet generated from a ruleset (M5-04 groundwork). The parent evaluates
 * the values and passes the result; changes go through `updateValue`, which keeps
 * exclusive groups and conditional criteria consistent.
 */
const props = defineProps<{
  ruleset: CompiledRuleset
  result: EvaluationResult
  disabled?: boolean
}>()
const values = defineModel<ScoreValues>({ required: true })

const explanations = computed(() => {
  const map = new Map<string, Explanation>()
  const walk = (e: Explanation) => {
    map.set(e.id, e)
    e.children?.forEach(walk)
  }
  walk(props.result.explanation)
  return map
})

const issues = computed(() => {
  const map = new Map<string, string[]>()
  for (const issue of props.result.issues) {
    if (!issue.nodeId) continue
    map.set(issue.nodeId, [...(map.get(issue.nodeId) ?? []), issue.message])
  }
  return map
})

function set(id: string, value: ScoreValue | undefined) {
  values.value = updateValue(props.ruleset, values.value, id, value)
}
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="score-sheet">
    <div
      class="sticky top-0 z-10 flex items-center justify-between rounded-lg border bg-background p-3 shadow-sm"
    >
      <span class="font-medium">{{ ruleset.definition.root.label }}</span>
      <span class="text-2xl font-semibold tabular-nums" data-testid="score-total">{{
        result.total
      }}</span>
    </div>
    <ScoreNodeField
      v-for="child in ruleset.definition.root.children"
      :key="child.id"
      :node="child"
      :values="values"
      :explanations="explanations"
      :issues="issues"
      :disabled="disabled"
      @set="set"
    />
  </div>
</template>
