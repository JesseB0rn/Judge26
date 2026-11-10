<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import type { LiveStatus } from '../useLiveUpdates'

/** Tells viewers whether what they see is current (M6-01, M6-T09). */
const props = defineProps<{ status: LiveStatus; stale?: boolean; updatedAt?: Date }>()

const time = computed(() =>
  props.updatedAt?.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
)
const offline = computed(() => props.stale || props.status === 'offline')
const label = computed(() => {
  if (offline.value) return time.value ? `Offline · data from ${time.value}` : 'Offline'
  if (props.status === 'connecting') return 'Connecting…'
  return time.value ? `Live · updated ${time.value}` : 'Live'
})
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        offline
          ? 'border-amber-400 bg-amber-50 text-amber-900'
          : 'border-emerald-300 bg-emerald-50 text-emerald-900',
      )
    "
    role="status"
    data-testid="live-indicator"
    :data-status="offline ? 'offline' : status"
  >
    <span
      :class="cn('size-2 rounded-full', offline ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse')"
      aria-hidden="true"
    />
    {{ label }}
  </span>
</template>
