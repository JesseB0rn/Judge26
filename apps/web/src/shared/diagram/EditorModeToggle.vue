<script setup lang="ts">
import { t } from '@/i18n'
import { BracesIcon, WorkflowIcon } from '@lucide/vue'
import FilterChips from '@/shared/components/FilterChips.vue'

/** Switches between the visual builder and the JSON editor of the same definition. */
const mode = defineModel<'visual' | 'json'>({ required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <FilterChips
      :model-value="mode"
      :label="t('diagram.editor')"
      required
      :options="[
        { value: 'visual', label: t('diagram.visual') },
        { value: 'json', label: 'JSON' },
      ]"
      @update:model-value="mode = $event as 'visual' | 'json'"
    />
    <span class="flex items-center gap-1 text-xs text-muted-foreground">
      <WorkflowIcon v-if="mode === 'visual'" class="size-3.5" />
      <BracesIcon v-else class="size-3.5" />
      {{ t('diagram.same') }}
    </span>
  </div>
</template>
