<script setup lang="ts">
import { t } from '@/i18n'

/** A row of large toggle chips (filters must be operable by touch, no hover). */
const props = defineProps<{
  label: string
  options: { value: string; label: string }[]
  allLabel?: string
  /** No "All" chip: one option is always selected. */
  required?: boolean
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="flex flex-wrap items-center gap-1.5">
    <span class="mr-1 text-sm text-muted-foreground">{{ label }}</span>
    <button
      v-for="option in props.required
        ? options
        : [{ value: '', label: allLabel ?? t('common.all') }, ...options]"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="min-h-10 rounded-full border px-4 text-sm font-medium transition-colors"
      :class="
        model === option.value
          ? 'border-foreground bg-foreground text-background'
          : 'bg-background hover:bg-muted'
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
