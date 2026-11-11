<script setup lang="ts">
import { t } from '@/i18n'
import type { Outcome } from '../types'

/** Did the run happen? Most games are "Scored"; the other two skip the score sheet. */
defineProps<{ modelValue: Outcome; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: Outcome] }>()

const OUTCOMES: Outcome[] = ['completed', 'disqualified', 'absent']
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="t('judging.outcome.label')"
    class="grid grid-cols-3 gap-1 rounded-xl border bg-muted/50 p-1"
    data-testid="outcome"
  >
    <button
      v-for="value in OUTCOMES"
      :key="value"
      type="button"
      role="radio"
      :aria-checked="modelValue === value"
      :disabled="disabled"
      class="flex min-h-12 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      :class="
        modelValue === value
          ? value === 'completed'
            ? 'bg-background font-semibold shadow-sm ring-1 ring-border'
            : 'bg-destructive/10 font-semibold text-destructive ring-1 ring-destructive/40'
          : 'text-muted-foreground hover:bg-background/60'
      "
      @click="emit('update:modelValue', value)"
    >
      <span class="text-base leading-tight">{{ t(`judging.outcome.${value}`) }}</span>
      <span class="text-xs font-normal opacity-80">{{ t(`judging.outcome.${value}Hint`) }}</span>
    </button>
  </div>
</template>
