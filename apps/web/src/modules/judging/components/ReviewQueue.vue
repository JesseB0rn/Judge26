<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCwIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import { listEventScores } from '../api'
import {
  filterAssignments,
  SCORE_STATE_LABELS,
  scoreState,
  tableOptions,
  type ScoreState,
} from '../lib'
import AssignmentList from './AssignmentList.vue'
import FilterChips from '@/shared/components/FilterChips.vue'

/**
 * Score board of an event for head judges and event managers (M5-11): sheets waiting for
 * review first; every game of the event with its score status on request.
 */
const props = defineProps<{ events: { id: string; name: string }[] }>()

const route = useRoute()
// Filters live in the URL, so returning from a score sheet shows the same queue.
const {
  event: eventId,
  state,
  table,
} = useQueryRefs({ event: props.events[0]?.id ?? '', state: 'submitted', table: '' })
if (!props.events.some((e) => e.id === eventId.value)) eventId.value = props.events[0]?.id ?? ''
const { data, loading, error, load } = useLoader(() => listEventScores(eventId.value))

const STATES: ScoreState[] = ['submitted', 'returned', 'draft', 'open', 'final']
const stateLabel = (state: ScoreState) =>
  state === 'submitted' ? t('judging.review.waiting') : SCORE_STATE_LABELS[state]

const rows = computed(() => data.value ?? [])
const tables = computed(() => tableOptions(rows.value))
const counts = computed(() => {
  const map: Record<string, number> = {}
  for (const row of rows.value) map[scoreState(row)] = (map[scoreState(row)] ?? 0) + 1
  return map
})
const stateOptions = computed(() =>
  STATES.map((s) => ({ value: s, label: `${stateLabel(s)} (${counts.value[s] ?? 0})` })),
)
const filtered = computed(() =>
  filterAssignments(rows.value, { day: '', table: table.value }).filter(
    (row) => !state.value || scoreState(row) === state.value,
  ),
)

onMounted(load)
watch(eventId, () => {
  table.value = ''
  void load()
})
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="review-queue">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <FilterChips
        v-if="events.length > 1"
        v-model="eventId"
        :label="t('events.event')"
        :options="events.map((e) => ({ value: e.id, label: e.name }))"
        required
      />
      <span v-else class="font-medium">{{ events[0]?.name }}</span>
      <Button variant="outline" size="touch" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" /> {{ t('common.refresh') }}
      </Button>
    </div>
    <ErrorAlert :error="error" />
    <FilterChips v-model="state" :label="t('common.status')" :options="stateOptions" />
    <FilterChips
      v-if="tables.length > 1"
      v-model="table"
      :label="t('teams.mine.table')"
      :options="tables"
    />
    <Skeleton v-if="loading && !data" class="h-24 w-full" />
    <AssignmentList :rows="filtered" show-table :from="route.fullPath" />
    <p
      v-if="data && !filtered.length"
      class="rounded-xl border border-dashed p-6 text-center text-muted-foreground"
      data-testid="review-empty"
    >
      {{ state === 'submitted' ? t('judging.review.nothingWaiting') : t('judging.noMatch') }}
    </p>
  </div>
</template>
