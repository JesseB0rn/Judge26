<script setup lang="ts">
import { t } from '@/i18n'
import { CircleAlertIcon, CircleCheckIcon, LayoutGridIcon, Undo2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/**
 * Common frame of the visual builders: palette and status on top (LabVIEW's broken run
 * arrow becomes an error count), the diagram on the left, the inspector on the right.
 */
defineProps<{ issueCount: number; canUndo: boolean; readonly?: boolean }>()
const emit = defineEmits<{ undo: []; tidy: [] }>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <div
        v-if="!readonly"
        class="flex flex-wrap items-center gap-1"
        role="toolbar"
        :aria-label="t('diagram.addBlock')"
      >
        <span class="mr-1 text-xs font-medium text-muted-foreground">{{ t('diagram.add') }}</span>
        <slot name="palette" />
      </div>
      <div class="ml-auto flex items-center gap-1">
        <span
          v-if="issueCount"
          class="flex items-center gap-1 text-sm font-medium text-destructive"
          data-testid="builder-status"
          ><CircleAlertIcon class="size-4" /> {{ t('diagram.errors', issueCount) }}</span
        >
        <span
          v-else
          class="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"
          data-testid="builder-status"
          ><CircleCheckIcon class="size-4" /> {{ t('diagram.valid') }}</span
        >
        <Button
          v-if="!readonly"
          variant="ghost"
          size="sm"
          :disabled="!canUndo"
          :aria-label="t('diagram.undo')"
          @click="emit('undo')"
          ><Undo2Icon /> {{ t('diagram.undo') }}</Button
        >
        <Button variant="ghost" size="sm" @click="emit('tidy')"
          ><LayoutGridIcon /> {{ t('diagram.tidy') }}</Button
        >
      </div>
    </div>

    <div class="grid gap-3 lg:grid-cols-[1fr_20rem]">
      <div class="flex min-w-0 flex-col gap-2">
        <slot />
      </div>
      <aside class="max-h-[640px] overflow-y-auto rounded-lg border p-3">
        <slot name="inspector" />
      </aside>
    </div>
  </div>
</template>
