<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CloudOffIcon,
  HistoryIcon,
  PencilIcon,
  RotateCcwIcon,
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
import { backTarget } from '@/shared/composables/useQueryRefs'
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
const route = useRoute()
const router = useRouter()

// Back always leads to the list this sheet was opened from, with its filters. A reviewer who
// opened the sheet without such a list (e.g. a shared link) goes to the review queue.
const back = computed(() => {
  const from = backTarget(route.query.from)
  if (from) return { to: from, review: from.startsWith('/review') }
  if (p.value?.permissions.canReview || p.value?.permissions.canCorrect) {
    return { to: `/review?event=${p.value.event.id}`, review: true }
  }
  return { to: '/judging', review: false }
})

const submitOpen = ref(false)
const rejectOpen = ref(false)
const correctOpen = ref(false)
const mulliganOpen = ref(false)
const showMissing = ref(false)

onMounted(() => {
  installAutoSync()
  void s.load()
})

const context = computed(() => {
  if (!p.value) return ''
  const { category, round, table, game, ruleset } = p.value
  return [
    category.code,
    round.name,
    ruleset?.game_rule?.name,
    table?.name,
    game.sequence > 0 ? `#${game.sequence}` : '',
    game.attempt > 1 ? t('judging.attempt', { attempt: game.attempt }) : '',
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
  [...new Set(missingIds.value)].map(
    (id) => s.ruleset.value?.nodes.get(id)?.label ?? t('scheduling.export.points'),
  ),
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
    toast.success(t('judging.sheet.submitted'))
  } else submitOpen.value = false
}

// After a review decision the head judge's next task is the next sheet in the queue, so the
// sheet closes itself; the toast names the team so the decision can be checked at a glance.
async function approve() {
  const team = p.value?.team.name
  if (await s.approve()) {
    toast.success(t('judging.sheet.approved', { team: team ?? '' }))
    await router.push(back.value.to)
  }
}

async function reject(reason: string) {
  const team = p.value?.team.name
  if (await s.reject(reason)) {
    rejectOpen.value = false
    toast.success(t('judging.sheet.returned', { team: team ?? '' }))
    await router.push(back.value.to)
  }
}

function requestCorrection() {
  if (!s.complete.value) return scrollToMissing()
  correctOpen.value = true
}

async function correct(reason: string) {
  if (await s.correct(reason)) {
    correctOpen.value = false
    toast.success(t('judging.sheet.corrected'))
  }
}

// M9-A: a re-run after a catastrophic failure. The head judge usually stays with the table while
// the team re-runs, so the sheet stays open.
async function mulligan(reason: string) {
  const team = p.value?.team.name
  if (await s.mulligan(reason)) {
    mulliganOpen.value = false
    toast.success(t('judging.sheet.mulliganGranted', { team: team ?? '' }))
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
      :to="back.to"
      class="-mt-4 inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      data-testid="back-link"
    >
      <ArrowLeftIcon class="size-4" />
      {{ back.review ? t('judging.reviewQueue') : t('judging.myGames') }}
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
                >{{ t('judging.sheet.correcting') }}</span
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
            <span class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{{
              t('judging.sheet.total')
            }}</span>
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
        <AlertTitle>{{ t('judging.sheet.noConnection') }}</AlertTitle>
        <AlertDescription>{{ t('judging.sheet.offline') }}</AlertDescription>
      </Alert>
      <Alert
        v-if="sheet?.review_note && (state === 'returned' || state === 'draft')"
        variant="destructive"
        data-testid="review-note"
      >
        <Undo2Icon />
        <AlertTitle>{{
          t('judging.sheet.returnedBy', {
            name: sheet.reviewed_by.name || t('judging.sheet.theHeadJudge'),
          })
        }}</AlertTitle>
        <AlertDescription>{{ sheet.review_note }}</AlertDescription>
      </Alert>
      <Alert v-if="state === 'submitted'" class="border-sky-300 bg-sky-50 text-sky-950">
        <AlertTitle>{{ t('judging.sheet.waiting') }}</AlertTitle>
        <AlertDescription>{{
          t('judging.sheet.submittedBy', {
            name: sheet?.submitted_by.name || t('judging.sheet.aJudge'),
          })
        }}</AlertDescription>
      </Alert>
      <Alert
        v-if="state === 'final' && !s.correcting.value"
        class="border-emerald-300 bg-emerald-50 text-emerald-950"
      >
        <CheckIcon />
        <AlertTitle>{{ t('judging.sheet.final') }}</AlertTitle>
        <AlertDescription>
          {{
            t('judging.sheet.approvedBy', {
              name: sheet?.reviewed_by.name || t('judging.sheet.theHeadJudge'),
            })
          }}<template v-if="sheet?.corrections">
            · {{ t('judging.sheet.correctedTimes', { count: sheet.corrections }) }}</template
          >. {{ t('judging.sheet.counts') }}
        </AlertDescription>
      </Alert>
      <Alert
        v-if="sheet?.mulligans && sheet.mulligan_reason"
        class="border-orange-300 bg-orange-50 text-orange-950"
        data-testid="mulligan-note"
      >
        <RotateCcwIcon />
        <AlertTitle>{{
          t('judging.sheet.mulliganBy', {
            name: sheet.mulligan_by.name || t('judging.sheet.theHeadJudge'),
          })
        }}</AlertTitle>
        <AlertDescription>{{ sheet.mulligan_reason }}</AlertDescription>
      </Alert>
      <Alert v-if="p.event.status === 'archived'">
        <AlertDescription>{{ t('judging.sheet.archived') }}</AlertDescription>
      </Alert>
      <Alert v-if="!p.ruleset && s.input.value.outcome === 'completed'">
        <AlertDescription>{{ t('judging.sheet.noRuleset') }}</AlertDescription>
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
          <label for="manual-points" class="font-medium">{{ t('scheduling.export.points') }}</label>
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
        {{
          s.input.value.outcome === 'absent'
            ? t('judging.sheet.noSheetAbsent')
            : t('judging.sheet.noSheetDisqualified')
        }}
      </p>

      <div v-if="p.permissions.canMulligan && !s.correcting.value" class="flex justify-end">
        <Button
          variant="outline"
          size="touch"
          class="border-orange-300 text-orange-900 hover:bg-orange-50"
          :disabled="s.busy.value"
          data-testid="mulligan"
          @click="mulliganOpen = true"
        >
          <RotateCcwIcon /> {{ t('judging.sheet.mulligan') }}
        </Button>
      </div>

      <details class="group rounded-lg border p-3" data-testid="history">
        <summary class="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-medium">
          <HistoryIcon class="size-4" /> {{ t('judging.sheet.history') }} ({{ p.history.length }})
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
                  <strong>{{ t('judging.sheet.missing', { count: missingLabels.length }) }}</strong>
                  {{ missingLabels.slice(0, 3).join(', ')
                  }}{{ missingLabels.length > 3 ? ', …' : '' }}
                </span>
              </button>
              <span v-else class="flex flex-1 items-center gap-2 text-sm text-emerald-700">
                <CheckIcon class="size-5" /> {{ t('judging.sheet.ready') }}
              </span>
              <Button size="touch" class="min-w-40" :disabled="s.busy.value" @click="requestSubmit">
                <SendIcon /> {{ t('judging.submit.submit') }}
              </Button>
            </template>

            <!-- Head judge: review a submitted sheet. -->
            <template v-else-if="p.permissions.canReview">
              <span class="flex-1 text-sm text-muted-foreground">{{
                t('judging.sheet.reviewHint')
              }}</span>
              <Button
                size="touch"
                variant="destructive"
                :disabled="s.busy.value"
                @click="rejectOpen = true"
              >
                <Undo2Icon /> {{ t('judging.sheet.return') }}
              </Button>
              <Button size="touch" class="min-w-36" :disabled="s.busy.value" @click="approve">
                <CheckIcon /> {{ t('teams.review.approve') }}
              </Button>
            </template>

            <!-- Head judge: correct a final score. -->
            <template v-else-if="s.correcting.value">
              <span class="flex-1 text-sm text-violet-900">
                {{ t('judging.sheet.correctingHint') }}
              </span>
              <Button size="touch" variant="outline" @click="s.cancelCorrection">{{
                t('common.cancel')
              }}</Button>
              <Button size="touch" :disabled="s.busy.value" @click="requestCorrection">
                <CheckIcon /> {{ t('judging.sheet.saveCorrection') }}
              </Button>
            </template>
            <template v-else-if="p.permissions.canCorrect">
              <span class="flex-1 text-sm text-muted-foreground"
                >{{ formatTime(s.input.value.time_ms) }} ·
                {{ t('judging.sheet.points', { points: s.total.value ?? '–' }) }}</span
              >
              <Button size="touch" variant="outline" @click="s.startCorrection">
                <PencilIcon /> {{ t('judging.sheet.correct') }}
              </Button>
            </template>

            <template v-else>
              <span class="flex-1" />
              <Button size="touch" as-child>
                <RouterLink :to="back.to"
                  ><ArrowLeftIcon />
                  {{
                    back.review ? t('judging.sheet.backToReview') : t('judging.sheet.backToGames')
                  }}</RouterLink
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
        :title="t('judging.sheet.returnTitle')"
        :description="t('judging.sheet.returnDescription')"
        :confirm-label="t('judging.sheet.returnConfirm')"
        destructive
        :busy="s.busy.value"
        :error="s.actionError.value"
        @confirm="reject"
      />
      <ReasonDialog
        v-model:open="correctOpen"
        :title="t('judging.sheet.saveCorrection')"
        :description="t('judging.sheet.correctionDescription')"
        :confirm-label="t('judging.sheet.saveCorrection')"
        :busy="s.busy.value"
        :error="s.actionError.value"
        @confirm="correct"
      />
      <ReasonDialog
        v-model:open="mulliganOpen"
        :title="t('judging.sheet.mulliganTitle')"
        :description="t('judging.sheet.mulliganDescription')"
        :confirm-label="t('judging.sheet.mulliganConfirm')"
        destructive
        :busy="s.busy.value"
        :error="s.actionError.value"
        @confirm="mulligan"
      />
    </template>
  </div>
</template>
