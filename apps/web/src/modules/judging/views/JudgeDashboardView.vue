<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { CloudOffIcon, PlayIcon, RefreshCwIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { listAssignments } from '../api'
import {
  cacheAssignments,
  cachedAssignments,
  installAutoSync,
  pendingDraftIds,
  syncPendingDrafts,
} from '../drafts'
import { dayOptions, filterAssignments, isToDo, scoreState, tableOptions } from '../lib'
import type { Assignment } from '../types'
import AssignmentList from '../components/AssignmentList.vue'
import FilterChips from '@/shared/components/FilterChips.vue'
import ReviewQueue from '../components/ReviewQueue.vue'
import ScoreStateBadge from '../components/ScoreStateBadge.vue'

/** Judge dashboard (M5-01, M5-02): the games on my table, in playing order. */
const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const rows = ref<Assignment[]>([])
const loading = ref(true)
const error = ref<AppError | null>(null)
const offline = ref(false)
const pending = ref(0)

const reviewEvents = computed(() => {
  const seen = new Map<string, string>()
  for (const r of session.roles) {
    if (r.event && (r.role === 'head_judge' || r.role === 'event_manager')) {
      seen.set(r.event, r.expand?.event?.name ?? 'Event')
    }
  }
  return [...seen].map(([id, name]) => ({ id, name }))
})

const tab = ref(route.query.tab === 'review' ? 'review' : 'games')
const day = ref(String(route.query.day ?? ''))
const table = ref(String(route.query.table ?? ''))
const show = ref(String(route.query.show ?? ''))

// Filters live in the URL, so "back" from a game returns to the same view.
watch([tab, day, table, show], () => {
  const query: Record<string, string> = {}
  if (tab.value !== 'games') query.tab = tab.value
  if (day.value) query.day = day.value
  if (table.value) query.table = table.value
  if (show.value) query.show = show.value
  void router.replace({ query })
})

const days = computed(() => dayOptions(rows.value))
const tables = computed(() => tableOptions(rows.value))
const filtered = computed(() => {
  const base = filterAssignments(rows.value, { day: day.value, table: table.value })
  return show.value === 'todo' ? base.filter(isToDo) : base
})
const scoped = computed(() => filterAssignments(rows.value, { day: day.value, table: table.value }))
const done = computed(() => scoped.value.filter((r) => !isToDo(r)).length)
const next = computed(() => scoped.value.find(isToDo))

async function load() {
  loading.value = true
  error.value = null
  const userId = session.user?.id ?? ''
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
  [row.category.code, row.round.name, row.table?.name, `#${row.sequence}`]
    .filter(Boolean)
    .join(' · ')
</script>

<template>
  <PageHeader title="Judging" description="Games on your table, in playing order.">
    <template #actions>
      <Button variant="outline" size="touch" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" /> Refresh
      </Button>
    </template>
  </PageHeader>

  <Tabs v-model="tab">
    <TabsList v-if="reviewEvents.length" class="mb-4">
      <TabsTrigger value="games">My games</TabsTrigger>
      <TabsTrigger value="review">Review</TabsTrigger>
    </TabsList>

    <TabsContent value="games" class="flex flex-col gap-4">
      <ErrorAlert :error="error" />
      <Alert v-if="offline" class="border-amber-300 bg-amber-50 text-amber-950">
        <CloudOffIcon />
        <AlertDescription>No connection. Showing the list saved on this device.</AlertDescription>
      </Alert>
      <Alert
        v-if="pending"
        class="border-amber-300 bg-amber-50 text-amber-950"
        data-testid="pending-sync"
      >
        <CloudOffIcon />
        <AlertDescription
          >{{ pending }} score sheet(s) saved on this device are waiting to be
          sent.</AlertDescription
        >
      </Alert>

      <Skeleton v-if="loading && !rows.length" class="h-32 w-full" />

      <!-- The one thing a judge needs right now. -->
      <RouterLink
        v-if="next"
        :to="{ name: 'judging-game', params: { id: next.id } }"
        class="flex items-center gap-4 rounded-2xl border-2 border-foreground/80 p-4 hover:bg-muted/50"
        data-testid="up-next"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >Up next</span
          >
          <span class="block truncate text-2xl font-bold">{{ next.team.name }}</span>
          <span class="block truncate text-muted-foreground">{{ context(next) }}</span>
        </span>
        <ScoreStateBadge :state="scoreState(next)" />
        <span
          class="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground"
        >
          <PlayIcon class="size-5" /> Score
        </span>
      </RouterLink>
      <p
        v-else-if="!loading && scoped.length"
        class="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"
        data-testid="all-done"
      >
        All games here are scored.
      </p>

      <div v-if="rows.length" class="flex flex-col gap-3" data-testid="filters">
        <FilterChips v-if="days.length > 1" v-model="day" label="Day" :options="days" />
        <FilterChips v-if="tables.length > 1" v-model="table" label="Table" :options="tables" />
        <div class="flex flex-wrap items-center justify-between gap-3">
          <FilterChips v-model="show" label="Show" :options="[{ value: 'todo', label: 'To do' }]" />
          <span class="text-sm text-muted-foreground" data-testid="progress"
            >{{ done }} of {{ scoped.length }} scored</span
          >
        </div>
      </div>

      <AssignmentList :rows="filtered" :show-table="tables.length > 1" :highlight="next?.id" />
      <p
        v-if="!loading && !error && !rows.length"
        class="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
        data-testid="no-assignments"
      >
        No games are assigned to your table yet.
      </p>
      <p
        v-else-if="rows.length && !filtered.length"
        class="rounded-xl border border-dashed p-6 text-center text-muted-foreground"
      >
        No games match these filters.
      </p>
    </TabsContent>

    <TabsContent v-if="reviewEvents.length" value="review">
      <ReviewQueue :events="reviewEvents" />
    </TabsContent>
  </Tabs>
</template>
