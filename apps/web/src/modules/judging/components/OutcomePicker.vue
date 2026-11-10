<script setup lang="ts">
import type { Outcome } from '../types'

/** Did the run happen? Most games are "Scored"; the other two skip the score sheet. */
defineProps<{ modelValue: Outcome; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: Outcome] }>()

const OPTIONS: { value: Outcome; label: string; hint: string }[] = [
  { value: 'completed', label: 'Scored', hint: 'The robot ran' },
  { value: 'disqualified', label: 'Disqualified', hint: 'No points' },
  { value: 'absent', label: 'Absent', hint: 'Did not start' },
]
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Result"
    class="grid grid-cols-3 gap-1 rounded-xl border bg-muted/50 p-1"
    data-testid="outcome"
  >
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :disabled="disabled"
      class="flex min-h-12 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      :class="
        modelValue === option.value
          ? option.value === 'completed'
            ? 'bg-background font-semibold shadow-sm ring-1 ring-border'
            : 'bg-destructive/10 font-semibold text-destructive ring-1 ring-destructive/40'
          : 'text-muted-foreground hover:bg-background/60'
      "
      @click="emit('update:modelValue', option.value)"
    >
      <span class="text-base leading-tight">{{ option.label }}</span>
      <span class="text-xs font-normal opacity-80">{{ option.hint }}</span>
    </button>
  </div>
</template>
