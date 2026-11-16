<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, ref } from 'vue'
import { CheckIcon, ChevronsRightIcon } from '@lucide/vue'
import { beginDrag, endDrag } from '@/shared/dragSelection'

/**
 * Slide to confirm (M10-06): the team confirms the verdict by sliding the handle to the end.
 * Releasing before the end springs back and confirms nothing. Keyboard: the handle is a slider;
 * arrow keys move it in quarters, End jumps to the end, Home back; reaching the end confirms.
 */
const props = defineProps<{ label: string; disabled?: boolean }>()
const confirmed = defineModel<boolean>({ default: false })

const track = ref<HTMLElement>()
const thumb = ref<HTMLElement>()
/** 0 … 1 while sliding. */
const progress = ref(0)
const dragging = ref(false)
let startX = 0
let startProgress = 0

const shown = computed(() => (confirmed.value ? 1 : progress.value))

function room() {
  const t = track.value?.getBoundingClientRect().width ?? 0
  const h = thumb.value?.getBoundingClientRect().width ?? 0
  return Math.max(1, t - h)
}

function set(value: number) {
  progress.value = Math.min(1, Math.max(0, value))
  if (progress.value >= 1) {
    confirmed.value = true
    stop()
  }
}

function onDown(event: PointerEvent) {
  if (props.disabled || confirmed.value || event.button !== 0) return
  dragging.value = true
  startX = event.clientX
  startProgress = progress.value
  beginDrag()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function onMove(event: PointerEvent) {
  if (!dragging.value) return
  // The end counts from 96 %, so a hand does not have to hit the last pixel.
  const value = startProgress + (event.clientX - startX) / room()
  set(value >= 0.96 ? 1 : value)
}

function onUp() {
  if (!confirmed.value) progress.value = 0
  stop()
}

function stop() {
  if (dragging.value) endDrag()
  dragging.value = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
}
onBeforeUnmount(stop)

function onKey(event: KeyboardEvent) {
  if (props.disabled || confirmed.value) return
  const steps: Record<string, number> = {
    ArrowRight: progress.value + 0.25,
    ArrowUp: progress.value + 0.25,
    ArrowLeft: progress.value - 0.25,
    ArrowDown: progress.value - 0.25,
    End: 1,
    Home: 0,
  }
  if (!(event.key in steps)) return
  event.preventDefault()
  set(steps[event.key]!)
}
</script>

<template>
  <div
    ref="track"
    class="relative flex h-16 items-center overflow-hidden rounded-full border-2 select-none"
    :class="[
      confirmed
        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
        : 'border-primary/60 bg-muted',
      disabled ? 'opacity-50' : '',
    ]"
    data-testid="slide-to-confirm"
    :data-confirmed="confirmed || undefined"
  >
    <!-- Filled part behind the handle -->
    <div
      class="absolute inset-y-0 left-0 bg-primary/15"
      :class="dragging ? '' : 'transition-[width] duration-200'"
      :style="{ width: `${shown * 100}%` }"
      aria-hidden="true"
    />
    <span
      class="pointer-events-none relative w-full px-20 text-center text-sm font-medium"
      :class="confirmed ? 'text-emerald-900 dark:text-emerald-100' : 'text-muted-foreground'"
    >
      {{ confirmed ? t('judging.confirm.confirmed') : label }}
    </span>
    <div
      ref="thumb"
      role="slider"
      tabindex="0"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(shown * 100)"
      :aria-valuetext="confirmed ? t('judging.confirm.confirmed') : `${Math.round(shown * 100)} %`"
      :aria-disabled="disabled || confirmed || undefined"
      class="absolute top-1 flex size-13 touch-none items-center justify-center rounded-full shadow-md outline-none focus-visible:ring-4 focus-visible:ring-ring/60"
      :class="[
        confirmed ? 'bg-emerald-600 text-white' : 'cursor-grab bg-primary text-primary-foreground',
        dragging ? '' : 'transition-[left] duration-200',
      ]"
      :style="{ left: `calc(${shown} * (100% - 3.75rem) + 0.25rem)` }"
      data-testid="slide-thumb"
      @pointerdown="onDown"
      @keydown="onKey"
    >
      <CheckIcon v-if="confirmed" class="size-6" />
      <ChevronsRightIcon v-else class="size-6" />
    </div>
  </div>
</template>
