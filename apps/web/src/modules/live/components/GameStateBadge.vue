<script setup lang="ts">
import { t, translatedLabels } from '@/i18n'
import { CircleCheckBigIcon, CircleDashedIcon, ClockIcon, PlayIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import type { GameState } from '../types'

/** Public game state with colour, icon and text. */
defineProps<{ state: GameState }>()

const LABELS = translatedLabels<GameState>(['upcoming', 'scoring', 'in_review', 'done'], (s) =>
  t(`live.state.${s}`),
)
const STYLES: Record<GameState, string> = {
  upcoming: 'border-border bg-background text-muted-foreground',
  scoring: 'border-amber-300 bg-amber-50 text-amber-900',
  in_review: 'border-sky-300 bg-sky-50 text-sky-900',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}
const ICONS = {
  upcoming: CircleDashedIcon,
  scoring: PlayIcon,
  in_review: ClockIcon,
  done: CircleCheckBigIcon,
}
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STYLES[state],
      )
    "
    :data-state="state"
    data-testid="game-state"
  >
    <component :is="ICONS[state]" class="size-3.5" aria-hidden="true" />
    {{ LABELS[state] }}
  </span>
</template>
