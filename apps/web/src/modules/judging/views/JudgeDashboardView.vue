<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  ClipboardListIcon,
  CloudOffIcon,
  PlayIcon,
  RefreshCwIcon,
  ScanSearchIcon,
} from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import { listAssignments } from '../api'
import {
  cacheAssignments,
  cachedAssignments,
  finishedChecks,
  installAutoSync,
  pendingDraftIds,
  syncPendingDrafts,
} from '../drafts'
import {
  buildTimeline,
  checkRoute,
  checkWhen,
  dayOptions,
  filterAssignments,
  filterChecks,
  isCheckDone,
  isToDo,
  nextUp,
  robotChecks,
  scoreState,
  tableOptions,
  type RobotCheckBlock,
} from '../lib'
import type { Assignment } from '../types'
import AssignmentList from '../components/AssignmentList.vue'
import FilterChips from '@/shared/components/FilterChips.vue'
import ScoreStateBadge from '../components/ScoreStateBadge.vue'

/**
 * Judge dashboard (M5-01, M5-02): one timeline of the games on my table in playing order, with
 * each round's robot check right before its games (M5-15). "Up next" is the first open item.
 */
const session = useSessionStore()
const route = useRoute()

const rows = ref<Assignment[]>([])
const loading = ref(true)
const error = ref<AppError | null>(null)
const offline = ref(false)
const pending = ref(0)
const finished = ref<string[]>([])

// Filters live in the URL, so "back" from a game returns to the same view.
const { day, table, show } = useQueryRefs({ day: '', table: '', show: '' })

const days = computed(() => dayOptions(rows.value))
const tables = computed(() => tableOptions(rows.value))
const filtered = computed(() => {
  const base = filterAssignments(rows.value, { day: day.value, table: table.value })
  return show.value === 'todo' ? base.filter(isToDo) : base
})
const scoped = computed(() => filterAssignments(rows.value, { day: day.value, table: table.value }))
const done = computed(() => scoped.value.filter((r) => !isToDo(r)).length)
// Robot checks of my rounds, on the check's own day (M5-15).
const scopedChecks = computed(() =>
  filterChecks(robotChecks(rows.value), { day: day.value, table: table.value }),
)
const checkDone = (block: RobotCheckBlock) => isCheckDone(block, rows.value, finished.value)
const checks = computed(() =>
  show.value === 'todo' ? scopedChecks.value.filter((b) => !checkDone(b)) : scopedChecks.value,
)
const next = computed(() => nextUp(buildTimeline(scoped.value, scopedChecks.value), checkDone))
const nextGame = computed(() => (next.value?.kind === 'game' ? next.value.row : undefined))
const nextCheck = computed(() => (next.value?.kind === 'check' ? next.value.block : undefined))
const highlight = computed(() =>
  nextCheck.value ? `check:${nextCheck.value.key}` : nextGame.value?.id,
)

async function load() {
  loading.value = true
  error.value = null
  const userId = session.user?.id ?? ''
  finished.value = finishedChecks(userId)
  try {
    await syncPendingDrafts()
    rows.value = await listAssignments()
    cacheAssignments(userId, rows.value)
    offline.value = false
  } catch (e) {
    const err = toAppError(e)
    const cached = err.kind === 'network' ? cachedAssignments(userId) : null
    if (cached) {
      rows.value = cached
      offline.value = true
    } else error.value = err
  } finally {
    pending.value = pendingDraftIds().length
    loading.value = false
  }
}

onMounted(() => {
  installAutoSync()
  void load()
  window.addEventListener('online', load)
})
onBeforeUnmount(() => window.removeEventListener('online', load))

const context = (row: Assignment) =>
  [
    row.category.code,
    row.round.name,
    row.round.starts_at ? t('teams.mine.from', { time: row.round.starts_at }) : '',
    row.table?.name,
    `#${row.sequence}`,
  ]
    .filter(Boolean)
    .join(' · ')
</script>

<template>
  <PageHeader :title="t('shell.nav.judging')" :description="t('judging.dashboard.description')">
    <template #actions>
      <Button variant="outline" size="touch" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" /> {{ t('common.refresh') }}
      </Button>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-4">
    <ErrorAlert :error="error" />
    <Alert v-if="offline" class="border-amber-300 bg-amber-50 text-amber-950">
      <CloudOffIcon />
      <AlertDescription>{{ t('judging.dashboard.offline') }}</AlertDescription>
    </Alert>
    <Alert
      v-if="pending"
      class="border-amber-300 bg-amber-50 text-amber-950"
      data-testid="pending-sync"
    >
      <CloudOffIcon />
      <AlertDescription>{{ t('judging.dashboard.pending', pending) }}</AlertDescription>
    </Alert>

    <Skeleton v-if="loading && !rows.length" class="h-32 w-full" />

    <!-- The one thing a judge needs right now. -->
    <RouterLink
      v-if="nextCheck"
      :to="checkRoute(nextCheck, route.fullPath)"
      class="flex items-center gap-4 rounded-2xl border-2 border-foreground/80 p-4 hover:bg-muted/50"
      data-testid="up-next"
    >
      <span class="min-w-0 flex-1">
        <span class="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">{{
          t('judging.dashboard.upNext')
        }}</span>
        <span class="block truncate text-2xl font-bold"
          >{{ t('judging.check.title') }} · {{ nextCheck.round.name }}</span
        >
        <span class="block truncate text-muted-foreground"
          >{{ nextCheck.category.code }} · {{ checkWhen(nextCheck) }} ·
          {{ t('judging.check.teams', nextCheck.teams.length) }}</span
        >
      </span>
      <span
        class="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground"
      >
        <ScanSearchIcon class="size-5" /> {{ t('judging.dashboard.check') }}
      </span>
    </RouterLink>
    <RouterLink
      v-else-if="nextGame"
      :to="{ name: 'judging-game', params: { id: nextGame.id }, query: { from: route.fullPath } }"
      class="flex items-center gap-4 rounded-2xl border-2 border-foreground/80 p-4 hover:bg-muted/50"
      data-testid="up-next"
    >
      <span class="min-w-0 flex-1">
        <span class="block text-xs font-semibold tracking-wider text-muted-foreground uppercase">{{
          t('judging.dashboard.upNext')
        }}</span>
        <span class="block truncate text-2xl font-bold">{{ nextGame.team.name }}</span>
        <span class="block truncate text-muted-foreground">{{ context(nextGame) }}</span>
      </span>
      <ScoreStateBadge :state="scoreState(nextGame)" />
      <span
        class="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground"
      >
        <PlayIcon class="size-5" /> {{ t('judging.dashboard.score') }}
      </span>
    </RouterLink>
    <p
      v-else-if="!loading && scoped.length"
      class="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"
      data-testid="all-done"
    >
      {{ t('judging.dashboard.allDone') }}
    </p>

    <div v-if="rows.length" class="flex flex-col gap-3" data-testid="filters">
      <FilterChips
        v-if="days.length > 1"
        v-model="day"
        :label="t('scheduling.export.day')"
        :options="days"
      />
      <FilterChips
        v-if="tables.length > 1"
        v-model="table"
        :label="t('teams.mine.table')"
        :options="tables"
      />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          v-model="show"
          :label="t('judging.dashboard.show')"
          :options="[{ value: 'todo', label: t('judging.dashboard.todo') }]"
        />
        <span class="text-sm text-muted-foreground" data-testid="progress">{{
          t('judging.dashboard.progress', { done, total: scoped.length })
        }}</span>
      </div>
    </div>

    <AssignmentList
      :rows="filtered"
      :checks="checks"
      :check-done="checkDone"
      :show-table="tables.length > 1"
      :highlight="highlight"
      :from="route.fullPath"
    />
    <p
      v-if="!loading && !error && !rows.length"
      class="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
      data-testid="no-assignments"
    >
      {{ t('judging.dashboard.empty') }}
      <RouterLink
        v-if="session.canReview"
        :to="{ name: 'review' }"
        class="mt-3 flex items-center justify-center gap-2 font-medium text-foreground underline"
      >
        <ClipboardListIcon class="size-4" /> {{ t('judging.dashboard.toReview') }}
      </RouterLink>
    </p>
    <p
      v-else-if="rows.length && !filtered.length"
      class="rounded-xl border border-dashed p-6 text-center text-muted-foreground"
    >
      {{ t('judging.noMatch') }}
    </p>
  </div>
</template>
