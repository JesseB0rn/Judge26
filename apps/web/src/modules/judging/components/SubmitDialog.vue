<script setup lang="ts">
import { t, translatedLabels } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { SendIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatTime } from '../lib'
import type { Outcome, TeamSignOff } from '../types'
import SlideToConfirm from './SlideToConfirm.vue'

/**
 * Final check before submission: the judge reads the result back to the team, and the team
 * confirms it by sliding (M10-06). If the event allows it, the judge can instead record that the
 * team refused, with a reason. Absent teams cannot sign.
 */
const props = defineProps<{
  team: string
  context: string
  outcome: Outcome
  total: number | null
  timeMs: number
  /** Decimals of the event's run times (M10-19). */
  decimals?: number
  /** Run times as seconds only instead of minutes:seconds. */
  secondsOnly?: boolean
  /** The time that counts instead of the measured one (zero points, M10-18), or null. */
  countedMs?: number | null
  busy?: boolean
  /** The event allows teams to refuse (M10-06). */
  allowRefusal?: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [signOff: TeamSignOff | undefined] }>()

const confirmed = ref(false)
const refusing = ref(false)
const reason = ref('')
// Every opening asks the team again.
watch(open, (isOpen) => {
  if (!isOpen) return
  confirmed.value = false
  refusing.value = false
  reason.value = ''
})

const needsTeam = computed(() => props.outcome !== 'absent')
const signOff = computed<TeamSignOff | undefined | null>(() => {
  if (!needsTeam.value) return undefined
  if (refusing.value) {
    const why = reason.value.trim()
    return why ? { team_confirmation: 'refused', refusal_reason: why } : null
  }
  return confirmed.value ? { team_confirmation: 'confirmed' } : null
})

function submit() {
  if (signOff.value === null) return
  emit('confirm', signOff.value)
}

const OUTCOME_LABELS = translatedLabels<Outcome>(['completed', 'disqualified', 'absent'], (o) =>
  t(`judging.submit.outcome.${o}`),
)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('judging.submit.title', { team }) }}</DialogTitle>
        <DialogDescription>{{ t('judging.submit.description') }}</DialogDescription>
      </DialogHeader>
      <dl
        class="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2"
        data-testid="submit-summary"
      >
        <dt class="text-sm text-muted-foreground">{{ t('judging.submit.game') }}</dt>
        <dd class="text-sm">{{ context }}</dd>
        <dt class="text-sm text-muted-foreground">{{ t('judging.outcome.label') }}</dt>
        <dd class="font-medium">{{ OUTCOME_LABELS[outcome] }}</dd>
        <template v-if="outcome === 'completed'">
          <dt class="text-sm text-muted-foreground">{{ t('judging.time') }}</dt>
          <dd class="font-mono text-lg tabular-nums">
            <template v-if="countedMs !== null && countedMs !== undefined">
              {{ formatTime(countedMs, decimals ?? 2, secondsOnly) }}
              <span class="block text-xs font-normal text-muted-foreground">{{
                t('judging.submit.countedTime', {
                  measured:
                    timeMs > 0
                      ? formatTime(timeMs, decimals ?? 2, secondsOnly)
                      : t('judging.submit.noTime'),
                })
              }}</span>
            </template>
            <template v-else>{{
              timeMs > 0
                ? formatTime(timeMs, decimals ?? 2, secondsOnly)
                : t('judging.submit.noTime')
            }}</template>
          </dd>
          <dt class="text-sm text-muted-foreground">{{ t('scheduling.export.points') }}</dt>
          <dd class="text-4xl font-bold tabular-nums">{{ total ?? '–' }}</dd>
        </template>
      </dl>
      <section v-if="needsTeam" class="flex flex-col gap-2" data-testid="team-sign-off">
        <template v-if="!refusing">
          <SlideToConfirm v-model="confirmed" :label="t('judging.confirm.slide', { team })" />
          <button
            v-if="allowRefusal && !confirmed"
            type="button"
            class="self-start text-sm text-muted-foreground underline underline-offset-2"
            data-testid="team-refuses"
            @click="refusing = true"
          >
            {{ t('judging.confirm.refuses') }}
          </button>
        </template>
        <template v-else>
          <label for="refusal-reason" class="text-sm font-medium">{{
            t('judging.confirm.refusalReason')
          }}</label>
          <Textarea id="refusal-reason" v-model="reason" rows="2" maxlength="1000" />
          <button
            type="button"
            class="self-start text-sm text-muted-foreground underline underline-offset-2"
            @click="refusing = false"
          >
            {{ t('judging.confirm.backToSlide') }}
          </button>
        </template>
      </section>
      <DialogFooter class="gap-2">
        <Button variant="outline" size="touch" @click="open = false">{{
          t('judging.submit.back')
        }}</Button>
        <Button size="touch" :disabled="busy || signOff === null" @click="submit">
          <SendIcon /> {{ t('judging.submit.submit') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
