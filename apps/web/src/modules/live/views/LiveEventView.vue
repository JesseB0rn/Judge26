<script setup lang="ts">
import { t } from '@/i18n'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { QrCodeIcon, TvIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FilterChips from '@/shared/components/FilterChips.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import QrCode from '@/shared/components/QrCode.vue'
import { useSessionStore } from '@/shared/auth/session'
import { formatDay } from '@/shared/format'
import { getPublicEvent, getPublicRanking } from '../api'
import {
  currentDay,
  dayLabel,
  filterGames,
  localDate,
  progressOf,
  roundSegments,
  liveRankingUrl,
  isPublicEvent,
  publishedCategories,
} from '../lib'
import type { RankingSource } from '../types'
import { useLiveResource } from '../useLiveResource'
import { useLiveUpdates } from '../useLiveUpdates'
import LiveIndicator from '../components/LiveIndicator.vue'
import ProgressBar from '../components/ProgressBar.vue'
import PublicRanking from '../components/PublicRanking.vue'
import ScheduleBoard from '../components/ScheduleBoard.vue'
import PlannerBoard from '@/modules/planner/components/PlannerBoard.vue'
import BlockDialog from '@/modules/planner/components/BlockDialog.vue'
import PhaseDialog from '@/modules/planner/components/PhaseDialog.vue'
import { gridColumns, sortedDays } from '@/modules/planner/lib'
import type { ItemRef } from '@/modules/planner/types'

/** Public page of an event: rankings, schedule and progress, updated live (M6-01 – M6-08). */
const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
/** The address the QR code points to (M10-35). */
const rankingUrl = computed(() =>
  liveRankingUrl(router.resolve({ name: 'live-event', params: { id: props.id } }).href),
)

const event = useLiveResource(
  () => `event.${props.id}`,
  () => getPublicEvent(props.id),
)

// Selection lives in the URL, so a refresh or a shared link shows the same view (M6-T09).
const tab = ref(String(route.query.tab ?? 'rankings'))
const category = ref(String(route.query.category ?? ''))
const day = ref(route.query.day === undefined ? undefined : String(route.query.day))
const source = ref<RankingSource | ''>((route.query.source as RankingSource | undefined) ?? '')

const categories = computed(() => event.data.value?.categories ?? [])
const categoryOptions = computed(() =>
  categories.value.map((c) => ({ value: c.id, label: c.name })),
)
const dayOptions = computed(() =>
  (event.data.value?.days ?? []).map((d) => ({
    value: d.id,
    label: d.label || formatDay(d.date),
  })),
)
const filters = computed(() => ({ category: category.value, day: day.value ?? '' }))

// Once the event is known: drop unknown selections and start on the current day (M6-09).
watch(
  () => event.data.value,
  (data) => {
    if (!data) return
    if (category.value && !data.categories.some((c) => c.id === category.value)) {
      category.value = ''
    }
    if (day.value === undefined || (day.value && !data.days.some((d) => d.id === day.value))) {
      day.value = currentDay(data, localDate(new Date()))
    }
  },
)

watch([tab, category, day, source], () => {
  const query: Record<string, string> = { tab: tab.value }
  if (category.value) query.category = category.value
  if (day.value !== undefined) query.day = day.value
  if (source.value) query.source = source.value
  void router.replace({ query })
})

const dayModel = computed({
  get: () => day.value ?? '',
  set: (value: string) => (day.value = value),
})

// "All categories" is allowed for the schedule; the ranking then shows the first category.
const rankingCategory = computed(
  () =>
    category.value || (publishedCategories(categories.value)[0] ?? categories.value[0])?.id || '',
)
const ranking = useLiveResource(
  () => `ranking.${rankingCategory.value}`,
  () => getPublicRanking(rankingCategory.value),
)
watch(rankingCategory, (id) => {
  if (id) void ranking.load()
})

async function reload() {
  await Promise.all([event.load(), rankingCategory.value ? ranking.load() : undefined])
}

const live = useLiveUpdates(() => props.id, reload, {
  shownRevision: () => {
    const revisions = [event.data.value?.revision, ranking.data.value?.revision].filter(
      (r): r is number => r !== undefined,
    )
    return revisions.length ? Math.min(...revisions) : undefined
  },
})

watch(
  () => props.id,
  () => void event.load(),
  { immediate: true },
)

const categoryProgress = computed(() => {
  const data = event.data.value
  if (!data) return []
  return data.categories.map((c) => {
    const games = filterGames(data, { category: c.id, day: day.value ?? '' })
    return { category: c, progress: progressOf(games), segments: roundSegments(data, games) }
  })
})
const overallGames = computed(() =>
  event.data.value ? filterGames(event.data.value, { day: day.value ?? '' }) : null,
)
const overall = computed(() => (overallGames.value ? progressOf(overallGames.value) : null))
// M10-36: the day's bar is divided by round.
const overallSegments = computed(() =>
  event.data.value && overallGames.value ? roundSegments(event.data.value, overallGames.value) : [],
)
const selectedDay = computed(() => event.data.value?.days.find((d) => d.id === day.value))
const stale = computed(() => event.stale.value || ranking.stale.value)

// Timetable (M4-14-26): all days next to one another, public blocks only.
const planner = computed(() => event.data.value?.planner)
const timetableDays = computed(() => sortedDays(planner.value?.days ?? []))
// The category filter limits the categories; custom columns are always shown (M4-14-33).
const timetableColumns = computed(() =>
  planner.value
    ? gridColumns(planner.value).filter(
        (c) => c.custom || !category.value || c.id === category.value,
      )
    : [],
)
const timetable = ref<InstanceType<typeof PlannerBoard>>()
watch([tab, () => !!planner.value], async ([t, ready]) => {
  if (t !== 'timetable' || !ready) return
  await nextTick()
  if (day.value) timetable.value?.scrollToDay(day.value)
})
const shownItem = ref<ItemRef | null>(null)
const itemOpen = computed({
  get: () => !!shownItem.value,
  set: (open: boolean) => {
    if (!open) shownItem.value = null
  },
})
const shownBlock = computed(() =>
  shownItem.value?.kind === 'block'
    ? (planner.value?.blocks.find((b) => b.id === shownItem.value!.id) ?? null)
    : null,
)
const shownPhase = computed(() =>
  shownItem.value?.kind === 'phase'
    ? (planner.value?.phases.find((p) => p.id === shownItem.value!.id) ?? null)
    : null,
)
const shownRound = computed(() =>
  planner.value?.rounds.find((r) => r.id === shownPhase.value?.round),
)
</script>

<template>
  <ErrorAlert v-if="!event.data.value" :error="event.error.value" />
  <Skeleton v-if="!event.data.value && event.loading.value" class="h-10 w-1/2" />
  <template v-if="event.data.value">
    <PageHeader
      :title="event.data.value.event.name"
      :description="
        t('events.detail.seasonLine', { season: event.data.value.event.season }) +
        (event.data.value.event.venue ? ' · ' + event.data.value.event.venue : '')
      "
    >
      <template #actions>
        <!-- M10-35: staff show the QR code of the live ranking (e.g. on a beamer). -->
        <details
          v-if="session.isEventStaff(props.id) && isPublicEvent(event.data.value.event.status)"
          class="relative self-center"
          data-testid="live-qr"
        >
          <summary
            class="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            <QrCodeIcon class="size-4" /> {{ t('live.qr.button') }}
          </summary>
          <div
            class="absolute right-0 z-20 mt-2 flex w-64 flex-col gap-2 rounded-xl border bg-background p-3 shadow-lg"
          >
            <QrCode class="size-56 self-center" :value="rankingUrl" :label="t('live.qr.label')" />
            <p class="text-center text-xs break-all text-muted-foreground">{{ rankingUrl }}</p>
          </div>
        </details>
        <LiveIndicator
          class="self-center"
          :status="live.status.value"
          :stale="stale"
          :updated-at="event.updatedAt.value"
        />
        <Button as-child variant="outline">
          <RouterLink
            :to="{
              name: 'live-tv',
              params: { id: props.id },
              query: day ? { day } : {},
            }"
            ><TvIcon /> {{ t('live.tvMode') }}</RouterLink
          >
        </Button>
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-col gap-3">
      <FilterChips
        v-if="categoryOptions.length > 1"
        :model-value="tab === 'rankings' ? rankingCategory : category"
        :label="t('teams.category')"
        :required="tab === 'rankings'"
        @update:model-value="category = $event"
        :options="categoryOptions"
      />
      <FilterChips
        v-if="tab !== 'rankings' && tab !== 'timetable' && dayOptions.length > 1"
        v-model="dayModel"
        :label="t('scheduling.export.day')"
        :options="dayOptions"
      />
    </div>

    <Tabs v-model="tab">
      <TabsList>
        <TabsTrigger value="rankings">{{ t('live.tabs.rankings') }}</TabsTrigger>
        <TabsTrigger value="schedule">{{ t('events.tabs.schedule') }}</TabsTrigger>
        <TabsTrigger v-if="planner" value="timetable">{{ t('live.tabs.timetable') }}</TabsTrigger>
        <TabsTrigger value="progress">{{ t('live.progress.title') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="rankings" class="pt-2">
        <ErrorAlert v-if="!ranking.data.value" :error="ranking.error.value" />
        <Skeleton v-if="!ranking.data.value && ranking.loading.value" class="h-40 w-full" />
        <PublicRanking
          v-if="ranking.data.value && ranking.data.value.category.id === rankingCategory"
          v-model:source="source"
          :ranking="ranking.data.value"
        />
      </TabsContent>

      <TabsContent value="schedule" class="pt-2">
        <ScheduleBoard :event="event.data.value" :filters="filters" />
      </TabsContent>

      <TabsContent v-if="planner" value="timetable" class="pt-2">
        <PlannerBoard
          ref="timetable"
          :data="planner"
          :days="timetableDays"
          :columns="timetableColumns"
          :storage-key="props.id"
          @open="shownItem = $event"
        />
        <BlockDialog
          v-model:open="itemOpen"
          :event-id="props.id"
          :block="shownBlock"
          :days="timetableDays"
          :categories="planner.categories"
          :custom-columns="planner.columns ?? []"
          :editable="false"
          v-if="shownItem?.kind === 'block'"
        />
        <PhaseDialog
          v-if="shownItem?.kind === 'phase'"
          v-model:open="itemOpen"
          :phase="shownPhase"
          :round="shownRound"
          :category="planner.categories.find((c) => c.id === shownRound?.category)"
          :siblings="[]"
          :days="timetableDays"
          :editable="false"
        />
      </TabsContent>

      <TabsContent value="progress" class="flex flex-col gap-4 pt-2">
        <Card v-if="overall">
          <CardHeader>
            <CardTitle>{{ selectedDay ? dayLabel(selectedDay) : t('live.allDays') }}</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-col gap-4">
            <ProgressBar
              :progress="overall"
              :segments="overallSegments"
              :label="t('teams.filter.allCategories')"
            />
            <ProgressBar
              v-for="row in categoryProgress"
              v-show="!category || row.category.id === category"
              :key="row.category.id"
              :progress="row.progress"
              :segments="row.segments"
              :label="row.category.name"
              :data-category="row.category.id"
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </template>
</template>
