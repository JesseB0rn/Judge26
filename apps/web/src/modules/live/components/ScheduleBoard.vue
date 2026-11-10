<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDay } from '@/shared/format'
import { scheduleGroups, tableQueues, type LiveFilters } from '../lib'
import type { PublicEvent } from '../types'
import GameStateBadge from './GameStateBadge.vue'
import ProgressBar from './ProgressBar.vue'

/** Now/next per table and the full playing order by round (M6-04). */
const props = defineProps<{ event: PublicEvent; filters: LiveFilters }>()

const groups = computed(() => scheduleGroups(props.event, props.filters))
const queues = computed(() =>
  tableQueues(props.event, props.filters).filter((q) => q.current || q.next.length),
)
const tableName = computed(() => new Map(props.event.tables.map((t) => [t.id, t.name])))
</script>

<template>
  <div class="flex flex-col gap-6">
    <section v-if="queues.length" aria-labelledby="tables-now">
      <h2 id="tables-now" class="mb-3 text-lg font-semibold">At the tables</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="q in queues"
          :key="q.table.id"
          class="gap-2 py-4"
          :data-table="q.table.name"
          data-testid="table-queue"
        >
          <CardHeader class="px-4">
            <CardTitle class="flex items-center justify-between text-base">
              {{ q.table.name }}
              <span class="text-xs font-normal text-muted-foreground"
                >{{ q.remaining }} to play</span
              >
            </CardTitle>
          </CardHeader>
          <CardContent class="flex flex-col gap-1.5 px-4 text-sm">
            <p v-if="q.current" class="flex items-center justify-between gap-2">
              <span>
                <span class="text-muted-foreground">Now</span>
                <span class="ml-2 font-semibold" data-testid="table-now">{{
                  q.current.team.name
                }}</span>
              </span>
              <GameStateBadge :state="q.current.state" />
            </p>
            <p v-for="g in q.next" :key="g.id" class="text-muted-foreground">
              Next <span class="ml-2 text-foreground">{{ g.team.name }}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </section>

    <p v-if="!groups.length" class="text-sm text-muted-foreground" data-testid="schedule-empty">
      No games scheduled for this selection.
    </p>

    <section
      v-for="group in groups"
      :key="group.round.id"
      class="flex flex-col gap-3"
      :data-round="group.round.id"
    >
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 class="text-lg font-semibold">
            {{ group.round.name }}
            <span class="text-sm font-normal text-muted-foreground"
              >· {{ group.category?.name }}</span
            >
          </h2>
          <p v-if="group.day" class="text-sm text-muted-foreground">
            {{ group.day.label ? `${group.day.label} · ` : '' }}{{ formatDay(group.day.date) }}
          </p>
        </div>
        <ProgressBar :progress="group.progress" class="w-full sm:w-72" />
      </div>
      <ol class="divide-y rounded-lg border">
        <li
          v-for="game in group.games"
          :key="game.id"
          class="flex items-center gap-3 px-3 py-2 text-sm"
          :data-game="game.id"
        >
          <span class="w-28 shrink-0 text-muted-foreground tabular-nums">
            {{ tableName.get(game.table) ?? 'Not placed' }}
            <template v-if="game.sequence"> · #{{ game.sequence }}</template>
          </span>
          <span class="min-w-0 flex-1">
            <span class="font-medium">{{ game.team.name }}</span>
            <span v-if="game.attempt > 1" class="text-muted-foreground">
              (attempt {{ game.attempt }})</span
            >
            <span
              v-if="game.team.organization || game.team.country"
              class="block truncate text-xs text-muted-foreground"
            >
              {{ [game.team.organization, game.team.country].filter(Boolean).join(' · ') }}
            </span>
          </span>
          <GameStateBadge :state="game.state" />
        </li>
      </ol>
    </section>
  </div>
</template>
