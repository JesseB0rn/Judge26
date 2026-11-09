<script setup lang="ts">
import { computed, useId } from 'vue'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'

const props = defineProps<{
  label: string
  /** Field name used to look up server-side validation errors. */
  name: string
  errors?: Record<string, string>
  description?: string
}>()

const id = `${props.name}-${useId()}`
const error = computed(() => props.errors?.[props.name])
</script>

<template>
  <Field :data-invalid="error ? true : undefined">
    <FieldLabel :for="id">{{ label }}</FieldLabel>
    <slot :id="id" :invalid="!!error" />
    <FieldDescription v-if="description">{{ description }}</FieldDescription>
    <FieldError v-if="error" :errors="[error]" />
  </Field>
</template>
