<script setup lang="ts">
import { t } from '@/i18n'
import { computed, nextTick, ref } from 'vue'
import { PauseIcon, PencilIcon, PlayIcon, RotateCcwIcon, SquareIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatTime, parseTime, type StopwatchPhase } from '../lib'

/**
 * Stopwatch (M5-07) and manual time entry (M5-08). The stopwatch runs on wall-clock time, so
 * it keeps running across reloads; "Stop" records its time as the game time.
 */
const props = defineProps<{
  phase: StopwatchPhase
  elapsedMs: number
  /** The recorded game time. */
  timeMs: number
  disabled?: boolean
}>()
const emit = defineEmits<{
  start: []
  pause: []
  stop: []
  reset: []
  setTime: [ms: number]
}>()

const editing = ref(false)
const text = ref('')
const error = ref('')
const inputEl = ref<InstanceType<typeof Input>>()

const display = computed(() => (props.phase === 'idle' ? props.timeMs : props.elapsedMs))
const label = computed(() => {
  if (props.phase === 'running') return t('judging.stopwatch.running')
  if (props.phase === 'paused') return t('judging.stopwatch.paused')
  return props.timeMs > 0 ? t('judging.stopwatch.recordedTime') : t('judging.time')
})

async function edit() {
  text.value = props.timeMs > 0 ? formatTime(props.timeMs) : ''
  error.value = ''
  editing.value = true
  await nextTick()
  ;(inputEl.value?.$el as HTMLInputElement | undefined)?.focus()
}

function save() {
  const ms = parseTime(text.value)
  if (ms === null) {
    error.value = t('judging.stopwatch.format', { example: '1:35.37', seconds: '95.37' })
    return
  }
  emit('setTime', ms)
  editing.value = false
}
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
    :class="phase === 'running' ? 'border-sky-400 bg-sky-50/60' : 'bg-card'"
    :aria-label="t('judging.stopwatch.title')"
    data-testid="stopwatch"
  >
    <div class="min-w-44">
      <div class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {{ label }}
      </div>
      <div
        class="font-mono text-4xl font-semibold tabular-nums"
        :class="{ 'text-sky-800': phase === 'running' }"
        data-testid="stopwatch-display"
        aria-live="off"
      >
        {{ formatTime(display) }}
      </div>
      <div
        v-if="phase !== 'idle' && timeMs > 0"
        class="text-xs text-muted-foreground"
        data-testid="recorded-time"
      >
        {{ t('judging.stopwatch.recorded', { time: formatTime(timeMs) }) }}
      </div>
    </div>

    <form v-if="editing" class="flex flex-1 flex-wrap items-start gap-2" @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label for="manual-time" class="sr-only">{{ t('judging.stopwatch.gameTime') }}</label>
        <Input
          id="manual-time"
          ref="inputEl"
          v-model="text"
          class="h-12 w-36 font-mono text-lg"
          inputmode="decimal"
          placeholder="1:35.37"
          autocomplete="off"
          :aria-invalid="!!error"
        />
        <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
      </div>
      <Button type="submit" size="touch">{{ t('judging.stopwatch.setTime') }}</Button>
      <Button type="button" size="touch" variant="ghost" @click="editing = false">{{
        t('common.cancel')
      }}</Button>
    </form>

    <div v-else-if="!disabled" class="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
      <Button
        v-if="phase !== 'running'"
        size="touch"
        :disabled="disabled"
        class="min-w-32"
        @click="emit('start')"
      >
        <PlayIcon />
        {{ phase === 'paused' ? t('judging.stopwatch.resume') : t('judging.stopwatch.start') }}
      </Button>
      <Button
        v-else
        size="touch"
        variant="secondary"
        :disabled="disabled"
        class="min-w-32"
        @click="emit('pause')"
      >
        <PauseIcon /> {{ t('judging.stopwatch.pause') }}
      </Button>
      <Button
        v-if="phase !== 'idle'"
        size="touch"
        variant="outline"
        :disabled="disabled"
        @click="emit('stop')"
      >
        <SquareIcon /> {{ t('judging.stopwatch.stop') }}
      </Button>
      <Button
        v-if="phase === 'paused'"
        size="icon-touch"
        variant="ghost"
        :disabled="disabled"
        :aria-label="t('judging.stopwatch.reset')"
        @click="emit('reset')"
      >
        <RotateCcwIcon />
      </Button>
      <Button
        v-if="phase === 'idle'"
        size="touch"
        variant="outline"
        :disabled="disabled"
        @click="edit"
      >
        <PencilIcon /> {{ t('judging.stopwatch.edit') }}
      </Button>
    </div>
  </section>
</template>
