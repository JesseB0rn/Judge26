<script setup lang="ts">
import { CloudCheckIcon, CloudOffIcon, LoaderCircleIcon, TriangleAlertIcon } from '@lucide/vue'
import type { SaveState } from '../useScoreSheet'

/** Autosave status (M5-09, M5-14). Text, not only an icon: judges must trust it. */
defineProps<{ state: SaveState; error?: string }>()
</script>

<template>
  <span
    v-if="state !== 'idle'"
    class="inline-flex items-center gap-1.5 text-sm"
    :class="{
      'text-muted-foreground': state === 'saved' || state === 'saving',
      'font-medium text-amber-700': state === 'offline',
      'font-medium text-destructive': state === 'error',
    }"
    role="status"
    aria-live="polite"
    data-testid="save-state"
    :title="error"
  >
    <template v-if="state === 'saving'">
      <LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" /> Saving…
    </template>
    <template v-else-if="state === 'saved'">
      <CloudCheckIcon class="size-4" aria-hidden="true" /> Saved
    </template>
    <template v-else-if="state === 'offline'">
      <CloudOffIcon class="size-4" aria-hidden="true" /> Offline · saved on this device
    </template>
    <template v-else>
      <TriangleAlertIcon class="size-4" aria-hidden="true" /> Not saved to server · retrying
    </template>
  </span>
</template>
