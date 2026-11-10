<script setup lang="ts">
import { computed } from 'vue'
import {
  CircleCheckBigIcon,
  CircleDashedIcon,
  CircleDotIcon,
  ClockIcon,
  PencilLineIcon,
  Undo2Icon,
} from '@lucide/vue'
import { cn } from '@/lib/utils'
import { SCORE_STATE_LABELS, type ScoreState } from '../lib'

/** Score status with colour *and* icon *and* text, so it reads at a glance (and without colour). */
const props = defineProps<{ state: ScoreState; size?: 'sm' | 'lg' }>()

const STYLES: Record<ScoreState, string> = {
  open: 'border-border bg-background text-muted-foreground',
  draft: 'border-amber-300 bg-amber-50 text-amber-900',
  returned: 'border-red-300 bg-red-50 text-red-800',
  submitted: 'border-sky-300 bg-sky-50 text-sky-900',
  final: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  recorded: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
}
const ICONS = {
  open: CircleDashedIcon,
  draft: PencilLineIcon,
  returned: Undo2Icon,
  submitted: ClockIcon,
  final: CircleCheckBigIcon,
  recorded: CircleDotIcon,
}
const icon = computed(() => ICONS[props.state])
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs',
        STYLES[state],
      )
    "
    :data-state="state"
    data-testid="score-state"
  >
    <component :is="icon" :class="size === 'lg' ? 'size-4' : 'size-3.5'" aria-hidden="true" />
    {{ SCORE_STATE_LABELS[state] }}
  </span>
</template>
