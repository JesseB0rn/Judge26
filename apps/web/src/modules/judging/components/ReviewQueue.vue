<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshCwIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import { listEventScores } from '../api'
import { filterAssignments, scoreState, tableOptions, type ScoreState } from '../lib'
import AssignmentList from './AssignmentList.vue'
import FilterChips from '@/shared/components/FilterChips.vue'

/**
 * Score board of an event for head judges and event managers (M5-11): sheets waiting for
 * review first; every game of the event with its score status on request.
 */
const props = defineProps<{ events: { id: string; name: string }[] }>()

const eventId = ref(props.events[0]?.id ?? '')
const state = ref<string>('submitted')
const table = ref('')
const { data, loading, error, load } = useLoader(() => listEventScores(eventId.value))

const STATES: { value: ScoreState; label: string }[] = [
  { value: 'submitted', label: 'Waiting for review' },
  { value: 'returned', label: 'Returned' },
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Not scored' },
  { value: 'final', label: 'Final' },
]

const rows = computed(() => data.value ?? [])
const tables = computed(() => tableOptions(rows.value))
const counts = computed(() => {
  const map: Record<string, number> = {}
  for (const row of rows.value) map[scoreState(row)] = (map[scoreState(row)] ?? 0) + 1
  return map
})
const stateOptions = computed(() =>
  STATES.map((s) => ({ value: s.value, label: `${s.label} (${counts.value[s.value] ?? 0})` })),
)
const filtered = computed(() =>
  filterAssignments(rows.value, { day: '', table: table.value }).filter(
    (row) => !state.value || scoreState(row) === state.value,
  ),
)

onMounted(load)
watch(eventId, load)
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="review-queue">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <FilterChips
        v-if="events.length > 1"
        v-model="eventId"
        label="Event"
        :options="events.map((e) => ({ value: e.id, label: e.name }))"
        required
      />
      <span v-else class="font-medium">{{ events[0]?.name }}</span>
      <Button variant="outline" size="touch" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" /> Refresh
      </Button>
    </div>
    <ErrorAlert :error="error" />
    <FilterChips v-model="state" label="Status" :options="stateOptions" />
    <FilterChips v-if="tables.length > 1" v-model="table" label="Table" :options="tables" />
    <Skeleton v-if="loading && !data" class="h-24 w-full" />
    <AssignmentList :rows="filtered" show-table />
    <p
      v-if="data && !filtered.length"
      class="rounded-xl border border-dashed p-6 text-center text-muted-foreground"
      data-testid="review-empty"
    >
      {{ state === 'submitted' ? 'Nothing waiting for review.' : 'No games match these filters.' }}
    </p>
  </div>
</template>
