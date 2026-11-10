<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRightIcon } from '@lucide/vue'
import { formatTime, groupByRound, scoreState } from '../lib'
import type { Assignment } from '../types'
import ScoreStateBadge from './ScoreStateBadge.vue'

/** Games in playing order, grouped by round; each row opens the score sheet. */
const props = defineProps<{ rows: Assignment[]; showTable?: boolean; highlight?: string }>()
const groups = computed(() => groupByRound(props.rows))

function result(row: Assignment) {
  const sheet = row.sheet
  const status = sheet?.outcome ?? row.status
  if (status === 'absent') return 'Absent'
  if (status === 'disqualified') return 'DQ'
  if (sheet && sheet.status !== 'draft') return `${sheet.points}`
  if (!sheet && row.status === 'completed') return `${row.points}`
  return ''
}
function time(row: Assignment) {
  const ms = row.sheet && row.sheet.status !== 'draft' ? row.sheet.time_ms : row.time_ms
  return ms > 0 ? formatTime(ms) : ''
}
</script>

<template>
  <div class="flex flex-col gap-6" data-testid="assignment-list">
    <section v-for="group in groups" :key="group.key" class="flex flex-col gap-2">
      <h2 class="flex flex-wrap items-baseline gap-x-2 px-1">
        <span class="text-lg font-semibold">{{ group.title }}</span>
        <span class="text-sm text-muted-foreground">{{ group.subtitle }}</span>
      </h2>
      <ul class="flex flex-col divide-y overflow-hidden rounded-xl border">
        <li v-for="row in group.rows" :key="row.id">
          <RouterLink
            :to="{ name: 'judging-game', params: { id: row.id } }"
            class="flex min-h-16 items-center gap-3 px-3 py-2 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
            :class="{ 'bg-sky-50/70': row.id === highlight }"
            :data-game="row.id"
            :aria-label="`Score ${row.team.name}`"
          >
            <span
              class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold tabular-nums"
              :title="`Position ${row.sequence} on ${row.table?.name ?? 'the table'}`"
            >
              {{ row.sequence || '–' }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base font-semibold">{{ row.team.name }}</span>
              <span class="block truncate text-sm text-muted-foreground">
                <template v-if="showTable">{{ row.table?.name ?? 'No table' }} · </template
                >{{ row.round.name
                }}<template v-if="row.attempt > 1"> · Attempt {{ row.attempt }}</template>
              </span>
            </span>
            <span v-if="result(row)" class="text-right tabular-nums">
              <span class="block text-lg font-semibold">{{ result(row) }}</span>
              <span v-if="time(row)" class="block font-mono text-xs text-muted-foreground">{{
                time(row)
              }}</span>
            </span>
            <ScoreStateBadge :state="scoreState(row)" />
            <ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
