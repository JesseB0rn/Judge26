<script setup lang="ts">
import { computed } from 'vue'
import { MinusIcon, PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Explanation, ScoreValue, ScoreValues, ScoringNode } from '@judge26/scoring-engine'

/** One node of a generated score sheet (recursive for groups). */
const props = defineProps<{
  node: ScoringNode
  values: ScoreValues
  explanations: Map<string, Explanation>
  issues: Map<string, string[]>
  disabled?: boolean
  /** Ids of criteria/groups still missing before submission (highlighted). */
  missing?: string[]
  /** Large touch targets (judge view). */
  touch?: boolean
}>()
const emit = defineEmits<{ set: [id: string, value: ScoreValue | undefined] }>()

const explanation = computed(() => props.explanations.get(props.node.id))
const inactive = computed(() => explanation.value?.active === false)
const locked = computed(() => props.disabled || inactive.value)
const value = computed(() => props.values[props.node.id])
const nodeIssues = computed(() => props.issues.get(props.node.id) ?? [])
const fieldId = computed(() => `criterion-${props.node.id}`)
const isMissing = computed(() => props.missing?.includes(props.node.id) ?? false)
const choiceSize = computed(() => (props.touch ? 'touch' : 'lg'))
const iconSize = computed(() => (props.touch ? 'icon-touch' : 'icon-lg'))

const selectionHint = computed(() => {
  if (props.node.type !== 'group' || !props.node.selection) return ''
  const { min, max } = props.node.selection
  if (min !== undefined && min === max) return `Choose exactly ${min}`
  if (max !== undefined && min) return `Choose ${min}–${max}`
  if (max !== undefined) return `Choose at most ${max}`
  return `Choose at least ${min}`
})

function setNumber(raw: string | number) {
  if (raw === '' || raw === null) return emit('set', props.node.id, undefined)
  const n = typeof raw === 'number' ? raw : Number(raw)
  emit('set', props.node.id, Number.isNaN(n) ? undefined : n)
}

function step(delta: number) {
  if (props.node.type !== 'number') return
  const current = typeof value.value === 'number' ? value.value : 0
  let next = current + delta
  if (props.node.min !== undefined) next = Math.max(props.node.min, next)
  if (props.node.max !== undefined) next = Math.min(props.node.max, next)
  emit('set', props.node.id, next)
}

const pointsLabel = (p: number) => (p > 0 ? `+${p}` : String(p))
</script>

<template>
  <fieldset
    v-if="node.type === 'group'"
    class="flex flex-col gap-3 rounded-lg border p-3"
    :class="{ 'opacity-50': inactive, 'border-amber-400 ring-2 ring-amber-200': isMissing }"
    :data-node="node.id"
    :data-missing="isMissing || undefined"
  >
    <legend class="flex w-full items-center gap-2 px-1 text-sm font-semibold">
      {{ node.label }}
      <span v-if="selectionHint" class="font-normal text-muted-foreground"
        >· {{ selectionHint }}</span
      >
      <span v-if="node.deduction" class="font-normal text-destructive">· deduction</span>
      <span class="ml-auto tabular-nums" data-testid="node-points">{{
        explanation?.points ?? 0
      }}</span>
    </legend>
    <p v-if="node.description" class="text-sm text-muted-foreground">{{ node.description }}</p>
    <p v-if="inactive" class="text-sm text-muted-foreground">Not available: condition not met.</p>
    <p v-for="msg in nodeIssues" :key="msg" class="text-sm text-destructive" role="alert">
      {{ msg }}
    </p>
    <ScoreNodeField
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :values="values"
      :explanations="explanations"
      :issues="issues"
      :disabled="disabled"
      :missing="missing"
      :touch="touch"
      @set="(id, v) => emit('set', id, v)"
    />
  </fieldset>

  <div
    v-else
    class="flex flex-col gap-2 rounded-md bg-muted/40 p-3"
    :class="{ 'opacity-50': inactive, 'bg-amber-50 ring-2 ring-amber-300': isMissing }"
    :data-node="node.id"
    :data-missing="isMissing || undefined"
  >
    <div class="flex flex-wrap items-center gap-3">
      <component
        :is="node.type === 'number' ? 'label' : 'span'"
        :id="`${fieldId}-label`"
        :for="node.type === 'number' ? fieldId : undefined"
        class="min-w-40 flex-1 font-medium"
        :class="touch ? 'text-base' : 'text-sm'"
      >
        {{ node.label }}
        <span
          v-if="'required' in node && node.required"
          class="text-destructive"
          aria-label="required"
          >*</span
        >
      </component>

      <!-- Boolean: large yes/no buttons for touch screens. -->
      <div
        v-if="node.type === 'boolean'"
        role="group"
        :aria-labelledby="`${fieldId}-label`"
        class="flex gap-1"
      >
        <Button
          type="button"
          :size="choiceSize"
          :variant="value === true ? 'default' : 'outline'"
          :aria-pressed="value === true"
          :disabled="locked"
          :class="{ 'min-w-28': touch }"
          @click="emit('set', node.id, value === true ? undefined : true)"
        >
          Yes ({{ node.deduction ? '−' : '+' }}{{ node.points }})
        </Button>
        <Button
          type="button"
          :size="choiceSize"
          :variant="value === false ? 'secondary' : 'outline'"
          :aria-pressed="value === false"
          :disabled="locked"
          :class="{ 'min-w-20 aria-pressed:ring-2 aria-pressed:ring-foreground/30': touch }"
          @click="emit('set', node.id, value === false ? undefined : false)"
        >
          No
        </Button>
      </div>

      <div v-else-if="node.type === 'number'" class="flex items-center gap-1">
        <Button
          type="button"
          :size="iconSize"
          variant="outline"
          :disabled="locked"
          aria-label="Decrease"
          @click="step(-1)"
        >
          <MinusIcon />
        </Button>
        <Input
          :id="fieldId"
          class="w-24 text-center tabular-nums"
          :class="{ 'h-12 text-lg font-semibold': touch }"
          type="number"
          inputmode="decimal"
          :min="node.min"
          :max="node.max"
          :step="node.integer ? 1 : 'any'"
          :disabled="locked"
          :model-value="typeof value === 'number' ? value : ''"
          @update:model-value="setNumber"
        />
        <Button
          type="button"
          :size="iconSize"
          variant="outline"
          :disabled="locked"
          aria-label="Increase"
          @click="step(1)"
        >
          <PlusIcon />
        </Button>
        <span class="text-sm text-muted-foreground">
          {{ node.unit ?? '' }} × {{ node.pointsPerUnit }}
        </span>
      </div>

      <div
        v-else
        role="radiogroup"
        :aria-labelledby="`${fieldId}-label`"
        class="flex flex-wrap gap-1"
      >
        <Button
          v-for="option in node.options"
          :key="option.id"
          type="button"
          :size="choiceSize"
          role="radio"
          :aria-checked="value === option.id"
          :variant="value === option.id ? 'default' : 'outline'"
          :disabled="locked"
          @click="emit('set', node.id, value === option.id ? undefined : option.id)"
        >
          {{ option.label }} ({{ pointsLabel(node.deduction ? -option.points : option.points) }})
        </Button>
      </div>

      <span
        class="w-12 text-right tabular-nums"
        :class="{ 'text-lg font-semibold': touch }"
        data-testid="node-points"
        >{{ explanation?.points ?? 0 }}</span
      >
    </div>
    <p v-if="node.description" class="text-sm text-muted-foreground">{{ node.description }}</p>
    <p v-if="inactive" class="text-sm text-muted-foreground">Not available: condition not met.</p>
    <p v-for="msg in nodeIssues" :key="msg" class="text-sm text-destructive" role="alert">
      {{ msg }}
    </p>
  </div>
</template>
