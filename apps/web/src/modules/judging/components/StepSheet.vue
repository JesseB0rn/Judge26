<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeftIcon, ArrowRightIcon, CircleAlertIcon, SendIcon } from '@lucide/vue'
import type { CompiledRuleset, EvaluationResult, ScoreValues } from '@judge26/scoring-engine'
import { Button } from '@/components/ui/button'
import ScoreSheet from '@/modules/scoring/components/ScoreSheet.vue'

/**
 * Step-by-step score sheet (M10-05): one top-level criterion (subtask) per screen, with back,
 * next, swipe and arrow keys, then a summary before submitting. It edits the same values as the
 * list view, so switching views never loses anything.
 */
const props = defineProps<{
  ruleset: CompiledRuleset
  result: EvaluationResult
  disabled?: boolean
  missing?: string[]
}>()
const values = defineModel<ScoreValues>({ required: true })
const emit = defineEmits<{ submit: [] }>()

const steps = computed(() => props.ruleset.definition.root.children)
/** 0 … steps.length; the last index is the summary. */
const index = ref(0)
const onSummary = computed(() => index.value >= steps.value.length)
const current = computed(() => steps.value[index.value])
watch(steps, (list) => (index.value = Math.min(index.value, list.length)))

const pointsOf = (id: string) => {
  const walk = (e: EvaluationResult['explanation']): number | undefined =>
    e.id === id ? e.points : e.children?.map(walk).find((p) => p !== undefined)
  return walk(props.result.explanation)
}
/** Steps that still miss a required answer (their own id or any criterion below them). */
const missingSteps = computed(() => {
  const missing = new Set(props.missing ?? [])
  const below = (node: (typeof steps.value)[number]): string[] =>
    node.type === 'group' ? [node.id, ...node.children.flatMap(below)] : [node.id]
  return new Set(steps.value.filter((s) => below(s).some((id) => missing.has(id))).map((s) => s.id))
})

function go(to: number) {
  index.value = Math.max(0, Math.min(steps.value.length, to))
}

// Swipe left/right on the step.
let swipeX: number | null = null
function onDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  swipeX = target.closest('button, input, select, textarea, [role=slider]') ? null : event.clientX
}
function onUp(event: PointerEvent) {
  if (swipeX === null) return
  const dx = event.clientX - swipeX
  swipeX = null
  if (Math.abs(dx) < 60) return
  go(index.value + (dx < 0 ? 1 : -1))
}

function onKey(event: KeyboardEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [role=dialog]')) return
  if (event.key === 'ArrowRight') go(index.value + 1)
  else if (event.key === 'ArrowLeft') go(index.value - 1)
  else return
  event.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section
    class="flex min-h-[60vh] touch-pan-y flex-col gap-4 rounded-xl border p-4"
    data-testid="step-sheet"
    @pointerdown="onDown"
    @pointerup="onUp"
  >
    <!-- Position: one dot per step, then the summary. -->
    <nav
      class="flex flex-wrap items-center gap-1.5"
      :aria-label="t('judging.steps.position', { n: index + 1, total: steps.length + 1 })"
    >
      <button
        v-for="(step, i) in steps"
        :key="step.id"
        type="button"
        class="h-2.5 rounded-full transition-all"
        :class="[
          i === index ? 'w-8 bg-primary' : 'w-2.5 bg-muted-foreground/30',
          missingSteps.has(step.id) && i !== index ? 'bg-destructive/60' : '',
        ]"
        :aria-label="step.label"
        :aria-current="i === index ? 'step' : undefined"
        @click="go(i)"
      />
      <button
        type="button"
        class="h-2.5 rounded-full transition-all"
        :class="onSummary ? 'w-8 bg-primary' : 'w-2.5 bg-muted-foreground/30'"
        :aria-label="t('judging.steps.summary')"
        :aria-current="onSummary ? 'step' : undefined"
        @click="go(steps.length)"
      />
      <span
        class="ml-auto text-sm text-muted-foreground tabular-nums"
        data-testid="step-position"
        >{{ t('judging.steps.position', { n: index + 1, total: steps.length + 1 }) }}</span
      >
    </nav>

    <div class="flex-1">
      <ScoreSheet
        v-if="current"
        :key="current.id"
        v-model="values"
        :ruleset="ruleset"
        :result="result"
        :disabled="disabled"
        :missing="missing"
        :only="current.id"
        hide-total
        touch
      />
      <div v-else class="flex flex-col gap-3" data-testid="step-summary">
        <h2 class="text-xl font-semibold">{{ t('judging.steps.summary') }}</h2>
        <ul class="flex flex-col divide-y rounded-lg border">
          <li v-for="(step, i) in steps" :key="step.id">
            <button
              type="button"
              class="flex min-h-12 w-full items-center gap-3 px-3 text-left hover:bg-muted/60"
              @click="go(i)"
            >
              <span class="min-w-0 flex-1 break-words">{{ step.label }}</span>
              <CircleAlertIcon
                v-if="missingSteps.has(step.id)"
                class="size-4 shrink-0 text-destructive"
                :aria-label="t('judging.steps.missing')"
              />
              <span class="font-semibold tabular-nums">{{ pointsOf(step.id) ?? 0 }}</span>
            </button>
          </li>
        </ul>
        <p class="flex items-center justify-between text-lg">
          <span class="font-medium">{{ t('judging.sheet.total') }}</span>
          <span class="text-3xl font-bold tabular-nums">{{ result.total }}</span>
        </p>
        <Button v-if="!disabled" size="touch" @click="emit('submit')">
          <SendIcon /> {{ t('judging.steps.toSubmit') }}
        </Button>
      </div>
    </div>

    <div class="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="touch"
        class="min-w-32"
        :disabled="index === 0"
        data-testid="step-back"
        @click="go(index - 1)"
      >
        <ArrowLeftIcon /> {{ t('judging.steps.back') }}
      </Button>
      <Button
        v-if="!onSummary"
        size="touch"
        class="min-w-32"
        data-testid="step-next"
        @click="go(index + 1)"
      >
        {{ t('judging.steps.next') }} <ArrowRightIcon />
      </Button>
    </div>
  </section>
</template>
