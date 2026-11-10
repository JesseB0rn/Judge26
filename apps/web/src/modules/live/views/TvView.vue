<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { MaximizeIcon } from '@lucide/vue'
import { getPublicEvent, getPublicRanking } from '../api'
import {
  currentDay,
  dayLabel,
  filterGames,
  localDate,
  pickRanking,
  progressOf,
  publishedCategories,
  isProvisional,
  parseRotate,
  parseTvView,
  tableQueues,
  tvSlides,
} from '../lib'
import type { PublicRanking, RankingSource } from '../types'
import { useLiveResource } from '../useLiveResource'
import { useLiveUpdates } from '../useLiveUpdates'
import LiveIndicator from '../components/LiveIndicator.vue'
import TvRanking from '../components/TvRanking.vue'

/**
 * TV mode (M6-05): a full-screen display without any navigation or administration controls
 * (M6-T07). Rotates through the published rankings (page by page), the tables and the progress.
 *
 * URL options: `view` (auto | ranking | tables | progress), `category` (comma-separated ids),
 * `day`, `source` (official | live), `rotate` (seconds).
 */
const props = defineProps<{ id: string }>()
const route = useRoute()

const view = computed(() => parseTvView(route.query.view))
const rotate = computed(() => parseRotate(route.query.rotate))
const source = computed(() => route.query.source as RankingSource | undefined)
const onlyCategories = computed(() =>
  String(route.query.category ?? '')
    .split(',')
    .filter(Boolean),
)

const event = useLiveResource(
  () => `event.${props.id}`,
  () => getPublicEvent(props.id),
)

const shownCategories = computed(() =>
  publishedCategories(event.data.value?.categories ?? []).filter(
    (c) => !onlyCategories.value.length || onlyCategories.value.includes(c.id),
  ),
)
const rankings = useLiveResource(
  () => `tv.${props.id}.${shownCategories.value.map((c) => c.id).join(',')}`,
  async () => {
    const list = await Promise.all(shownCategories.value.map((c) => getPublicRanking(c.id)))
    return Object.fromEntries(list.map((r) => [r.category.id, r])) as Record<string, PublicRanking>
  },
)

async function reload() {
  await event.load()
  await rankings.load()
}

const live = useLiveUpdates(() => props.id, reload, {
  shownRevision: () => {
    const revisions = [
      event.data.value?.revision,
      ...Object.values(rankings.data.value ?? {}).map((r) => r.revision),
    ].filter((r): r is number => r !== undefined)
    return revisions.length ? Math.min(...revisions) : undefined
  },
})

const day = computed(() => {
  const data = event.data.value
  if (!data) return ''
  const requested = String(route.query.day ?? '')
  return data.days.some((d) => d.id === requested)
    ? requested
    : currentDay(data, localDate(new Date()))
})
const dayInfo = computed(() => event.data.value?.days.find((d) => d.id === day.value))

// Rows per ranking page follow the screen height.
const height = ref(window.innerHeight)
const onResize = () => (height.value = window.innerHeight)
const rowsPerPage = computed(() => Math.max(5, Math.floor((height.value - 260) / 64)))

const slides = computed(() =>
  tvSlides({
    view: view.value,
    rankings: shownCategories.value
      .map((c) => {
        const picked = pickRanking(rankings.data.value?.[c.id], source.value)
        return picked ? { category: c.id, rows: picked.ranking.result.entries.length } : null
      })
      .filter((r): r is { category: string; rows: number } => r !== null),
    rowsPerPage: rowsPerPage.value,
    hasTables: !!event.data.value?.tables.length,
  }),
)
const index = ref(0)
const slide = computed(() => slides.value[index.value % Math.max(1, slides.value.length)])
watch(slides, (list) => {
  if (index.value >= list.length) index.value = 0
})

let timer: ReturnType<typeof setInterval> | undefined
watch(
  rotate,
  (seconds) => {
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      if (slides.value.length > 1) index.value = (index.value + 1) % slides.value.length
    }, seconds * 1000)
  },
  { immediate: true },
)

const clock = ref(new Date())
const clockTimer = setInterval(() => (clock.value = new Date()), 1000)

const fullscreen = ref(false)
const onFullscreen = () => (fullscreen.value = !!document.fullscreenElement)
function enterFullscreen() {
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
}

onMounted(() => {
  void reload()
  window.addEventListener('resize', onResize)
  document.addEventListener('fullscreenchange', onFullscreen)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  clearInterval(clockTimer)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('fullscreenchange', onFullscreen)
})

const slideRanking = computed(() => {
  const s = slide.value
  if (s?.kind !== 'ranking') return null
  const data = rankings.data.value?.[s.category]
  const picked = pickRanking(data, source.value)
  if (!data || !picked) return null
  return {
    data,
    picked,
    category: shownCategories.value.find((c) => c.id === s.category),
    provisional: isProvisional(data, picked.source),
  }
})
const queues = computed(() =>
  event.data.value ? tableQueues(event.data.value, { day: day.value }, 2) : [],
)
const progressRows = computed(() => {
  const data = event.data.value
  if (!data) return []
  return data.categories
    .filter((c) => !onlyCategories.value.length || onlyCategories.value.includes(c.id))
    .map((c) => ({
      category: c,
      progress: progressOf(filterGames(data, { category: c.id, day: day.value })),
    }))
    .filter((r) => r.progress.total > 0)
})
const title = computed(() => {
  const s = slide.value
  if (!s) return ''
  if (s.kind === 'ranking') {
    const name = slideRanking.value?.category?.name ?? ''
    return s.pages > 1 ? `${name} · ${s.page + 1}/${s.pages}` : name
  }
  if (s.kind === 'tables') return `At the tables · ${dayLabel(dayInfo.value)}`
  return `Progress · ${dayLabel(dayInfo.value)}`
})
</script>

<template>
  <div
    class="flex h-svh flex-col overflow-hidden bg-slate-950 text-slate-50"
    :class="{ 'cursor-none': fullscreen }"
    data-testid="tv"
  >
    <header class="flex items-center gap-6 border-b border-slate-800 px-8 py-4">
      <div class="min-w-0 flex-1">
        <p class="truncate text-[clamp(0.9rem,1.8vh,1.5rem)] text-slate-400">
          {{ event.data.value?.event.name }}
        </p>
        <h1 class="truncate text-[clamp(1.5rem,4vh,3.5rem)] font-bold" data-testid="tv-title">
          {{ title }}
        </h1>
      </div>
      <span
        v-if="slideRanking"
        class="rounded-full px-4 py-1 text-[clamp(0.8rem,1.6vh,1.25rem)] font-semibold"
        :class="
          slideRanking.picked.source === 'official'
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-amber-500/20 text-amber-200'
        "
        data-testid="tv-source"
      >
        {{
          slideRanking.picked.source === 'official'
            ? 'Official'
            : slideRanking.provisional
              ? 'Live · provisional'
              : 'Live'
        }}
      </span>
      <span class="text-[clamp(1.25rem,3.5vh,3rem)] font-semibold tabular-nums">
        {{ clock.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }}
      </span>
    </header>

    <main class="min-h-0 flex-1 px-8 py-6">
      <p v-if="!event.data.value && event.error.value" class="text-2xl text-slate-400">
        {{ event.error.value.message }}
      </p>
      <p v-else-if="event.data.value && !slides.length" class="text-3xl text-slate-400">
        No results have been published yet.
      </p>

      <template v-else-if="slide?.kind === 'ranking' && slideRanking">
        <TvRanking
          :ranking="slideRanking.picked.ranking"
          :teams="slideRanking.data.teams"
          :page="slide.page"
          :per-page="rowsPerPage"
        />
      </template>

      <div
        v-else-if="slide?.kind === 'tables'"
        class="grid gap-4 text-[clamp(1rem,2.4vh,2rem)]"
        :style="{
          gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, queues.length))}, minmax(0, 1fr))`,
        }"
      >
        <section
          v-for="q in queues"
          :key="q.table.id"
          class="rounded-xl bg-slate-800/70 p-5"
          data-testid="tv-table"
        >
          <h2 class="text-[0.8em] font-semibold text-slate-400">{{ q.table.name }}</h2>
          <p v-if="q.current" class="mt-2 text-[1.3em] font-bold">{{ q.current.team.name }}</p>
          <p v-else class="mt-2 text-slate-500">Done for today</p>
          <p v-for="g in q.next" :key="g.id" class="mt-1 text-[0.85em] text-slate-300">
            <span class="text-slate-500">Next</span> {{ g.team.name }}
          </p>
        </section>
      </div>

      <div
        v-else-if="slide?.kind === 'progress'"
        class="flex flex-col gap-6 text-[clamp(1rem,2.6vh,2.25rem)]"
      >
        <div v-for="row in progressRows" :key="row.category.id" data-testid="tv-progress">
          <div class="mb-2 flex justify-between">
            <span class="font-semibold">{{ row.category.name }}</span>
            <span class="text-slate-300 tabular-nums"
              >{{ row.progress.done }} / {{ row.progress.total }} games</span
            >
          </div>
          <div class="flex h-[0.8em] overflow-hidden rounded-full bg-slate-800">
            <div
              class="bg-emerald-500"
              :style="{ width: `${(row.progress.done / row.progress.total) * 100}%` }"
            />
            <div
              class="bg-sky-400"
              :style="{ width: `${(row.progress.inReview / row.progress.total) * 100}%` }"
            />
          </div>
        </div>
        <p v-if="!progressRows.length" class="text-slate-400">No games on this day.</p>
      </div>
    </main>

    <footer class="flex items-center gap-4 border-t border-slate-800 px-8 py-3">
      <LiveIndicator
        :status="live.status.value"
        :stale="event.stale.value || rankings.stale.value"
        :updated-at="event.updatedAt.value"
      />
      <div class="flex flex-1 justify-center gap-1.5" aria-hidden="true">
        <span
          v-for="(_, i) in slides"
          :key="i"
          class="size-2 rounded-full"
          :class="i === index ? 'bg-slate-200' : 'bg-slate-700'"
        />
      </div>
      <button
        v-if="!fullscreen"
        type="button"
        class="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        @click="enterFullscreen"
      >
        <MaximizeIcon class="size-4" /> Full screen
      </button>
    </footer>
  </div>
</template>
