<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CloudOffIcon,
  HistoryIcon,
  LockIcon,
  MapPinIcon,
  PencilIcon,
  RotateCcwIcon,
  SendIcon,
  Undo2Icon,
} from '@lucide/vue'
import { usesZeroPointsTime, type ScoreValues } from '@judge26/scoring-engine'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import ScoreSheet from '@/modules/scoring/components/ScoreSheet.vue'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { backTarget } from '@/shared/composables/useQueryRefs'
import { formatDay } from '@/shared/format'
import { useLiveUpdates } from '@/modules/live/useLiveUpdates'
import { cachePage, installAutoSync } from '../drafts'
import { formatTime, gateExplanation, gateLabel, scoreState } from '../lib'
import { useScoreSheet } from '../useScoreSheet'
import OutcomePicker from '../components/OutcomePicker.vue'
import ProgramNameField from '../components/ProgramNameField.vue'
import ReasonDialog from '../components/ReasonDialog.vue'
import RoundFilePanel from '../components/RoundFilePanel.vue'
import SaveIndicator from '../components/SaveIndicator.vue'
import ScoreHistory from '../components/ScoreHistory.vue'
import ScoreStateBadge from '../components/ScoreStateBadge.vue'
import StopwatchPanel from '../components/StopwatchPanel.vue'
import SubmitDialog from '../components/SubmitDialog.vue'
import StepSheet from '../components/StepSheet.vue'
import type { TeamSignOff } from '../types'

/**
 * Score sheet of one game at the table (M5-03 – M5-12). Built to be read in a hurry: who is
 * playing and the current total are always visible at the top; the one next action is always
 * at the bottom.
 */
const props = defineProps<{ id: string }>()
const s = useScoreSheet(props.id)
const p = computed(() => s.payload.value)
/** Decimals of the event's run times (M10-19). */
const decimals = computed(() => p.value?.event.time_decimals ?? 0)
const secondsOnly = computed(() => !!p.value?.event.time_seconds_only)
/** The time a zero-point run counts with instead of the measured one (M10-18), or null. */
const countedMs = computed(() => {
  const definition = p.value?.ruleset?.definition
  if (s.input.value.outcome !== 'completed' || !usesZeroPointsTime(definition, s.total.value))
    return null
  return definition!.zeroPointsTimeMs!
})
const route = useRoute()
const router = useRouter()

// List or step-by-step view (M10-05), remembered on this device.
const VIEW_KEY = 'judge26.judging.sheetView'
function storedView(): 'list' | 'steps' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'steps' ? 'steps' : 'list'
  } catch {
    return 'list'
  }
}
const sheetView = ref(storedView())
watch(sheetView, (view) => {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Not remembered (storage blocked); the view still switches.
  }
})

/**
 * Where a submitted sheet leads (M10-02): back to the judge dashboard (with its filters, or the
 * table a head judge stepped in at), however the sheet was opened. A reviewer who came from the
 * review queue stays, as before.
 */
const afterSubmit = computed(() => {
  const from = backTarget(route.query.from)
  if (from && /^\/judging(\?|$)/.test(from)) return from
  if (from?.startsWith('/review')) return null
  if (!from && (p.value?.permissions.canReview || p.value?.permissions.canCorrect)) return null
  return '/judging'
})

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

// A locked sheet unlocks without a reload when the round is released or the check confirmed
// (M10-T15, M10-T18). An open sheet is not reloaded, so nothing being entered is replaced.
useLiveUpdates(
  () => p.value?.event.id,
  () => (s.locked.value && !s.fromCache.value ? s.load() : undefined),
)

/** The team's robot check, linked from a sheet locked until that check (M10-12). */
const checkLink = computed(() =>
  p.value
    ? {
        name: 'judging-check',
        params: { roundId: p.value.round.id },
        query: {
          ...(p.value.table ? { table: p.value.table.id } : {}),
          team: p.value.team.id,
          from: route.fullPath,
          ...(typeof route.query.seat === 'string' ? { seat: route.query.seat } : {}),
        },
      }
    : null,
)

const context = computed(() => {
  if (!p.value) return ''
  const { category, round, game, ruleset } = p.value
  return [
    category.code,
    round.name,
    ruleset?.game_rule?.name,
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

async function confirmSubmit(signOff: TeamSignOff | undefined) {
  if (await s.submit(signOff)) {
    submitOpen.value = false
    showMissing.value = false
    toast.success(t('judging.sheet.submittedTeam', { team: p.value?.team.name ?? '' }))
    // The next open item is marked on the dashboard (M10-02).
    if (afterSubmit.value) await router.push(afterSubmit.value)
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

// M9-B: the program can be changed by the table judge until submission, by reviewers at any time.
const programEditable = computed(
  () =>
    !!p.value &&
    !s.fromCache.value &&
    (!!p.value.permissions.canEdit ||
      !!p.value.permissions.canReview ||
      !!p.value.permissions.canCorrect ||
      !!p.value.permissions.canMulligan),
)
function programSaved(value: string) {
  const current = s.payload.value
  if (!current) return
  s.payload.value = { ...current, game: { ...current.game, program_name: value } }
  cachePage(s.payload.value)
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
            <!-- M10-04: the whole name, wrapped, never cut off. -->
            <h1
              class="text-2xl font-bold tracking-tight break-words hyphens-auto sm:text-3xl"
              data-testid="team-name"
            >
              {{ p.team.name }}
            </h1>
            <p class="text-base text-muted-foreground" data-testid="game-context">
              {{ context }}<template v-if="day"> · {{ day }}</template>
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <!-- M10-01: the table, so the judge does not get lost. -->
              <span
                v-if="p.table"
                class="inline-flex items-center gap-1 rounded-full border-2 border-foreground/70 px-3 py-0.5 text-sm font-semibold"
                data-testid="sheet-table"
                ><MapPinIcon class="size-3.5" aria-hidden="true" />{{ p.table.name }}</span
              >
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
          <!-- M10-03: the recorded run time next to the points, in the event's precision. -->
          <div
            v-if="s.input.value.outcome === 'completed' && s.input.value.time_ms > 0"
            class="flex flex-col items-end rounded-xl border-2 border-foreground/30 px-3 py-1.5"
          >
            <span class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{{
              t('judging.time')
            }}</span>
            <span
              class="font-mono text-3xl leading-none font-bold tabular-nums"
              data-testid="header-time"
              >{{ formatTime(s.input.value.time_ms, decimals, secondsOnly) }}</span
            >
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

      <!-- M9-B: verify the program before the start, above the stopwatch. -->
      <ProgramNameField
        :game-id="p.game.id"
        :model-value="p.game.program_name ?? ''"
        mode="sheet"
        :editable="programEditable"
        @update:model-value="programSaved"
      />

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
      <!-- M10-B: scoring waits for the release, the team's check or the parts check. -->
      <Alert
        v-if="s.locked.value && s.status.value !== 'submitted' && s.status.value !== 'finalized'"
        class="border-amber-300 bg-amber-50 text-amber-950"
        data-testid="sheet-locked"
        :data-gate="s.gate.value"
      >
        <LockIcon />
        <AlertTitle>{{ gateLabel(s.gate.value) }}</AlertTitle>
        <AlertDescription class="flex flex-col items-start gap-2">
          <span>{{ gateExplanation(s.gate.value, p.robot_check?.parts_check?.title) }}</span>
          <span v-if="s.gate.value === 'not_confirmed'" class="flex flex-wrap gap-2">
            <Button v-if="checkLink" as-child size="touch" data-testid="to-check">
              <RouterLink :to="checkLink">{{ t('checks.toCheck') }}</RouterLink>
            </Button>
            <Button
              v-if="p.permissions.canEdit"
              variant="outline"
              size="touch"
              data-testid="mark-absent"
              @click="s.markAbsent"
              >{{ t('checks.markAbsent') }}</Button
            >
          </span>
        </AlertDescription>
      </Alert>
      <!-- M10-17: the round's randomization file, once the check is confirmed. -->
      <RoundFilePanel v-if="p.round_file" :round-id="p.round.id" :file="p.round_file" />
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
          :decimals="decimals"
          :seconds-only="secondsOnly"
          :disabled="!s.editable.value"
          @start="s.startWatch"
          @pause="s.pauseWatch"
          @stop="s.stopWatch"
          @reset="s.resetWatch"
          @set-time="s.setTime"
        />
        <p
          v-if="countedMs !== null"
          class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          data-testid="zero-points-time"
        >
          {{
            t('judging.sheet.zeroPointsTime', {
              time: formatTime(countedMs, decimals, secondsOnly),
            })
          }}
        </p>

        <div
          v-if="s.ruleset.value && s.result.value"
          class="inline-flex self-end rounded-lg border p-0.5"
          role="group"
          :aria-label="t('judging.steps.view')"
          data-testid="sheet-view"
        >
          <button
            v-for="view in ['list', 'steps'] as const"
            :key="view"
            type="button"
            class="min-h-9 rounded-md px-3 text-sm font-medium"
            :class="sheetView === view ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
            :aria-pressed="sheetView === view"
            @click="sheetView = view"
          >
            {{ view === 'list' ? t('judging.steps.views.list') : t('judging.steps.views.steps') }}
          </button>
        </div>
        <StepSheet
          v-if="s.ruleset.value && s.result.value && sheetView === 'steps'"
          v-model="values"
          :ruleset="s.ruleset.value"
          :result="s.result.value"
          :disabled="!s.editable.value"
          :missing="
            showMissing ? missingIds : s.problems.value.map((i) => i.nodeId!).filter(Boolean)
          "
          @submit="requestSubmit"
        />
        <ScoreSheet
          v-else-if="s.ruleset.value && s.result.value"
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
          <ScoreHistory
            :entries="p.history"
            :definition="p.ruleset?.definition"
            :decimals="decimals"
            :seconds-only="secondsOnly"
          />
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
                >{{ formatTime(countedMs ?? s.input.value.time_ms, decimals, secondsOnly) }} ·
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
        :decimals="decimals"
        :seconds-only="secondsOnly"
        :counted-ms="countedMs"
        :allow-refusal="!!p.event.allow_team_refusal"
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
