<script setup lang="ts">
import { computed, useId } from 'vue'
import { Input } from '@/components/ui/input'

/**
 * One labelled inspector input. Commits on change (blur or Enter), not on every keystroke,
 * so a half-typed value such as "-" or an id being renamed never reaches the definition.
 * Numbers: an empty field commits `undefined` (the property is removed).
 */
const props = defineProps<{
  label: string
  modelValue: unknown
  type?: 'text' | 'number'
  placeholder?: string
  disabled?: boolean
  hint?: string
}>()
const emit = defineEmits<{ commit: [value: string | number | undefined] }>()
const id = useId()
const shown = computed(() =>
  props.modelValue === undefined || props.modelValue === null ? '' : String(props.modelValue),
)

function onChange(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  if (props.type !== 'number') return emit('commit', raw)
  if (raw.trim() === '') return emit('commit', undefined)
  const n = Number(raw.replace(',', '.'))
  emit('commit', Number.isFinite(n) ? n : undefined)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" class="text-xs font-medium text-muted-foreground">{{ label }}</label>
    <Input
      :id="id"
      :model-value="shown"
      :type="type === 'number' ? 'text' : 'text'"
      :inputmode="type === 'number' ? 'decimal' : undefined"
      :placeholder="placeholder"
      :disabled="disabled"
      class="h-8"
      @change="onChange"
    />
    <p v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>
