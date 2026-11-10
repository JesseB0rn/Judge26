<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CloudOffIcon,
  HistoryIcon,
  PencilIcon,
  SendIcon,
  Undo2Icon,
} from '@lucide/vue'
import type { ScoreValues } from '@judge26/scoring-engine'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import ScoreSheet from '@/modules/scoring/components/ScoreSheet.vue'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { formatDay } from '@/shared/format'
import { installAutoSync } from '../drafts'
import { formatTime, scoreState } from '../lib'
import { useScoreSheet } from '../useScoreSheet'
import OutcomePicker from '../components/OutcomePicker.vue'
import ReasonDialog from '../components/ReasonDialog.vue'
import SaveIndicator from '../components/SaveIndicator.vue'
import ScoreHistory from '../components/ScoreHistory.vue'
import ScoreStateBadge from '../components/ScoreStateBadge.vue'
import StopwatchPanel from '../components/StopwatchPanel.vue'
import SubmitDialog from '../components/SubmitDialog.vue'

/**
 * Score sheet of one game at the table (M5-03 – M5-12). Built to be read in a hurry: who is
 * playing and the current total are always visible at the top; the one next action is always
 * at the bottom.
 */
const props = defineProps<{ id: string }>()
const s = useScoreSheet(props.id)
const p = computed(() => s.payload.value)

const submitOpen = ref(false)
const rejectOpen = ref(false)
const correctOpen = ref(false)
const showMissing = ref(false)

onMounted(() => {
  installAutoSync()
  void s.load()
})

const context = computed(() => {
  if (!p.value) return ''
  const { category, round, table, game } = p.value
  return [
    category.code,
    round.name,
    table?.name,
    game.sequence > 0 ? `#${game.sequence}` : '',
    game.attempt > 1 ? `Attempt ${game.attempt}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})
const day = computed(() => {
  const d = p.value?.day
  return d ? d.label || formatDay(d.date) : ''
})

const state = computed(() =>
  p.value ? scoreState({ status: p.value.game.status, sheet: p.value.sheet }) : 'open',
)
const sheet = computed(() => p.value?.sheet ?? null)
const values = computed({
  get: () => s.input.value.values,
  set: (v: ScoreValues) => s.setValues(v),
})

const missingIds = computed(() => s.problems.value.map((i) => i.nodeId!).filter(Boolean))
const missingLabels = computed(() =>
  [...new Set(missingIds.value)].map((id) => s.ruleset.value?.nodes.get(id)?.label ?? 'Points'),
)

function scrollToMissing() {
  showMissing.value = true
  const id = missingIds.value[0]
  const el = id ? document.querySelector(`[data-node="${id}"], #manual-points`) : null
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}

function requestSubmit() {
  if (!s.complete.value) return scrollToMissing()
  submitOpen.value = true
}

async function confirmSubmit() {
  if (await s.submit()) {
    submitOpen.value = false
    showMissing.value = false
    toast.success('Score submitted.')
  } else submitOpen.value = false
}

async function approve() {
  if (await s.approve()) toast.success('Score approved and final.')
}

async function reject(reason: string) {
  if (await s.reject(reason)) {
    rejectOpen.value = false
    toast.success('Score returned to the judge.')
  }
}

function requestCorrection() {
  if (!s.complete.value) return scrollToMissing()
  correctOpen.value = true
}

async function correct(reason: string) {
  if (await s.correct(reason)) {
    correctOpen.value = false
    toast.success('Correction saved.')
  }
}

function setManualPoints(raw: string | number) {
  const n = raw === '' ? null : Number(raw)
  s.setPoints(n === null || Number.isNaN(n) ? null : n)
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 pb-32" data-testid="score-game">
    <RouterLink
      :to="{ name: 'judging' }"
      class="-mt-4 inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon class="size-4" /> My games
    </RouterLink>

    <ErrorAlert :error="s.loadError.value" />
    <Skeleton v-if="s.loading.value && !p" class="h-28 w-full" />

    <template v-if="p">
      <!-- Who is playing, and the score: always visible. -->
      <header
        class="sticky top-0 z-20 -mx-4 border-b bg-background px-4 py-3 shadow-[0_4px_16px_rgb(0_0_0/0.04)]"
        data-testid="game-header"
      >
        <div class="flex items-start gap-4">
          <div class="min-w-0 flex-1">
            <h1
              class="truncate text-2xl font-bold tracking-tight sm:text-3xl"
              data-testid="team-name"
            >
              {{ p.team.name }}
            </h1>
            <p class="text-base text-muted-foreground" data-testid="game-context">
              {{ context }}<template v-if="day"> · {{ day }}</template>
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <ScoreStateBadge :state="state" size="lg" />
              <span
                v-if="s.correcting.value"
                class="rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-sm font-medium text-violet-900"
                >Correcting</span
              >
              <SaveIndicator
                v-if="s.editable.value && !s.correcting.value"
                :state="s.saveState.value"
                :error="s.saveError.value"
              />
            </div>
          </div>
          <div
            class="flex min-w-24 flex-col items-end rounded-xl border-2 px-3 py-1.5"
            :class="state === 'final' ? 'border-emerald-400' : 'border-foreground/80'"
          >
            <span class="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
              >Total</span
            >
            <span
              class="text-5xl leading-none font-bold tabular-nums"
              data-testid="live-total"
              aria-live="polite"
              >{{ s.total.value ?? '–' }}</span
            >
          </div>
        </div>
      </header>

      <!-- What is going on with this sheet. -->
      <Alert v-if="s.notice.value" role="alert" class="border-amber-300 bg-amber-50 text-amber-950">
        <CircleAlertIcon />
        <AlertDescription data-testid="sync-notice">{{ s.notice.value }}</AlertDescription>
      </Alert>
      <Alert v-if="s.fromCache.value" class="border-amber-300 bg-amber-50 text-amber-950">
        <CloudOffIcon />
        <AlertTitle>No connection</AlertTitle>
        <AlertDescription
          >You can keep scoring. Changes are stored on this device and sent when the connection is
          back.</AlertDescription
        >
      </Alert>
      <Alert
        v-if="sheet?.review_note && (state === 'returned' || state === 'draft')"
        variant="destructive"
        data-testid="review-note"
      >
        <Undo2Icon />
        <AlertTitle>Returned by {{ sheet.reviewed_by.name || 'the head judge' }}</AlertTitle>
        <AlertDescription>{{ sheet.review_note }}</AlertDescription>
      </Alert>
      <Alert v-if="state === 'submitted'" class="border-sky-300 bg-sky-50 text-sky-950">
        <AlertTitle>Submitted – waiting for the head judge</AlertTitle>
        <AlertDescription
          >Submitted by {{ sheet?.submitted_by.name || 'a judge' }}. The score can no longer be
          changed here.</AlertDescription
        >
      </Alert>
      <Alert
        v-if="state === 'final' && !s.correcting.value"
        class="border-emerald-300 bg-emerald-50 text-emerald-950"
      >
        <CheckIcon />
        <AlertTitle>Final score</AlertTitle>
        <AlertDescription>
          Approved by {{ sheet?.reviewed_by.name || 'the head judge'
          }}<template v-if="sheet?.corrections"> · corrected {{ sheet.corrections }}×</template>. It
          counts in the ranking.
        </AlertDescription>
      </Alert>
      <Alert v-if="p.event.status === 'archived'">
        <AlertDescription>The event is archived. Scores are read-only.</AlertDescription>
      </Alert>
      <Alert v-if="!p.ruleset && s.input.value.outcome === 'completed'">
        <AlertDescription
          >This category has no published score sheet. Enter the points directly.</AlertDescription
        >
      </Alert>

      <OutcomePicker
        :model-value="s.input.value.outcome"
        :disabled="!s.editable.value"
        @update:model-value="s.setOutcome"
      />

      <template v-if="s.input.value.outcome === 'completed'">
        <StopwatchPanel
          :phase="s.watchPhase.value"
          :elapsed-ms="s.watchElapsed.value"
          :time-ms="s.input.value.time_ms"
          :disabled="!s.editable.value"
          @start="s.startWatch"
          @pause="s.pauseWatch"
          @stop="s.stopWatch"
          @reset="s.resetWatch"
          @set-time="s.setTime"
        />

        <ScoreSheet
          v-if="s.ruleset.value && s.result.value"
          v-model="values"
          :ruleset="s.ruleset.value"
          :result="s.result.value"
          :disabled="!s.editable.value"
          :missing="showMissing ? missingIds : []"
          hide-total
          touch
        />
        <div v-else class="flex flex-col gap-2 rounded-lg border p-3">
          <label for="manual-points" class="font-medium">Points</label>
          <Input
            id="manual-points"
            class="h-12 w-40 text-lg"
            type="number"
            step="any"
            inputmode="decimal"
            :disabled="!s.editable.value"
            :model-value="s.input.value.points ?? ''"
            @update:model-value="setManualPoints"
          />
        </div>
      </template>
      <p v-else class="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
        No score sheet needed: the game is recorded as
        <strong>{{ s.input.value.outcome === 'absent' ? 'absent' : 'disqualified' }}</strong> with
        no points.
      </p>

      <details class="group rounded-lg border p-3" data-testid="history">
        <summary class="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-medium">
          <HistoryIcon class="size-4" /> History ({{ p.history.length }})
        </summary>
        <div class="mt-3">
          <ScoreHistory :entries="p.history" :definition="p.ruleset?.definition" />
        </div>
      </details>

      <!-- The next action, always in the same place. -->
      <footer
        class="fixed inset-x-0 bottom-0 z-30 border-t bg-background shadow-[0_-4px_16px_rgb(0_0_0/0.06)]"
        data-testid="action-bar"
      >
        <div class="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
          <ErrorAlert :error="s.actionError.value" />
          <div class="flex flex-wrap items-center gap-3">
            <!-- Judge: complete and submit. -->
            <template v-if="s.editable.value && !s.correcting.value">
              <button
                v-if="!s.complete.value"
                type="button"
                class="flex min-h-12 flex-1 items-center gap-2 rounded-lg px-2 text-left text-amber-800 hover:bg-amber-50"
                data-testid="missing"
                @click="scrollToMissing"
              >
                <CircleAlertIcon class="size-5 shrink-0" />
                <span class="text-sm">
                  <strong>{{ missingLabels.length }} missing:</strong>
                  {{ missingLabels.slice(0, 3).join(', ')
                  }}{{ missingLabels.length > 3 ? ', …' : '' }}
                </span>
              </button>
              <span v-else class="flex flex-1 items-center gap-2 text-sm text-emerald-700">
                <CheckIcon class="size-5" /> Ready to submit
              </span>
              <Button size="touch" class="min-w-40" :disabled="s.busy.value" @click="requestSubmit">
                <SendIcon /> Submit score
              </Button>
            </template>

            <!-- Head judge: review a submitted sheet. -->
            <template v-else-if="p.permissions.canReview">
              <span class="flex-1 text-sm text-muted-foreground"
                >Check the sheet, then approve or return it.</span
              >
              <Button
                size="touch"
                variant="destructive"
                :disabled="s.busy.value"
                @click="rejectOpen = true"
              >
                <Undo2Icon /> Return
              </Button>
              <Button size="touch" class="min-w-36" :disabled="s.busy.value" @click="approve">
                <CheckIcon /> Approve
              </Button>
            </template>

            <!-- Head judge: correct a final score. -->
            <template v-else-if="s.correcting.value">
              <span class="flex-1 text-sm text-violet-900">
                Changing a final score. A reason is required.
              </span>
              <Button size="touch" variant="outline" @click="s.cancelCorrection">Cancel</Button>
              <Button size="touch" :disabled="s.busy.value" @click="requestCorrection">
                <CheckIcon /> Save correction
              </Button>
            </template>
            <template v-else-if="p.permissions.canCorrect">
              <span class="flex-1 text-sm text-muted-foreground"
                >{{ formatTime(s.input.value.time_ms) }} · {{ s.total.value ?? '–' }} points</span
              >
              <Button size="touch" variant="outline" @click="s.startCorrection">
                <PencilIcon /> Correct score
              </Button>
            </template>

            <template v-else>
              <span class="flex-1" />
              <Button size="touch" as-child>
                <RouterLink :to="{ name: 'judging' }"
                  ><ArrowLeftIcon /> Back to my games</RouterLink
                >
              </Button>
            </template>
          </div>
        </div>
      </footer>

      <SubmitDialog
        v-model:open="submitOpen"
        :team="p.team.name"
        :context="context"
        :outcome="s.input.value.outcome"
        :total="s.total.value"
        :time-ms="s.input.value.time_ms"
        :busy="s.busy.value"
        @confirm="confirmSubmit"
      />
      <ReasonDialog
        v-model:open="rejectOpen"
        title="Return to the judge"
        description="The judge sees the reason and can fix and resubmit the sheet."
        confirm-label="Return sheet"
        destructive
        :busy="s.busy.value"
        :error="s.actionError.value"
        @confirm="reject"
      />
      <ReasonDialog
        v-model:open="correctOpen"
        title="Save correction"
        description="The old and new values and your reason are recorded in the history."
        confirm-label="Save correction"
        :busy="s.busy.value"
        :error="s.actionError.value"
        @confirm="correct"
      />
    </template>
  </div>
</template>
