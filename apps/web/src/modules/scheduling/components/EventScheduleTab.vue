<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import {
  listEventCategories,
  listEventJudges,
  listScheduleGames,
  listScheduleIssues,
  listTables,
} from '../api'
import GenerateSchedulePanel from './GenerateSchedulePanel.vue'
import ScheduleGamesPanel from './ScheduleGamesPanel.vue'
import TablesPanel from './TablesPanel.vue'

const props = defineProps<{ event: EventRecord; canManage: boolean }>()

const tables = useLoader(() => listTables(props.event.id))
const games = useLoader(() => listScheduleGames(props.event.id))
const judges = useLoader(() => listEventJudges(props.event.id))
const categories = useLoader(() => listEventCategories(props.event.id))
const issues = useLoader(() => listScheduleIssues(props.event.id))

const all = [tables, games, judges, categories, issues]
const loading = computed(() => all.some((l) => l.loading.value))
const firstError = computed(() => all.map((l) => l.error.value).find(Boolean) ?? null)
let reloadRequested = false
let reloadPromise: Promise<void> | undefined

const labels = computed(() => {
  const map: Record<string, string> = {}
  for (const game of games.data.value ?? []) {
    const team = game.expand?.team?.name ?? 'Unknown team'
    const round = game.expand?.round?.name
    map[game.id] = round ? `${team} (${round})` : team
  }
  return map
})

function reload() {
  reloadRequested = true
  if (reloadPromise) return reloadPromise

  reloadPromise = (async () => {
    while (reloadRequested) {
      reloadRequested = false
      await Promise.all(all.map((loader) => loader.load()))
    }
  })().finally(() => {
    reloadPromise = undefined
  })
  return reloadPromise
}

onMounted(reload)
watch(() => props.event.id, reload)
</script>

<template>
  <div class="flex flex-col gap-4">
    <ErrorAlert :error="firstError" />
    <p v-if="loading && !games.data.value" class="text-sm text-muted-foreground">Loading…</p>
    <div class="grid gap-4 lg:grid-cols-2">
      <TablesPanel
        :event-id="event.id"
        :tables="tables.data.value ?? []"
        :categories="categories.data.value ?? []"
        :judges="judges.data.value ?? []"
        :editable="canManage"
        @changed="reload"
      />
    </div>
    <GenerateSchedulePanel
      :event-id="event.id"
      :issues="issues.data.value ?? []"
      :labels="labels"
      :editable="canManage"
      @changed="reload"
    />
    <ScheduleGamesPanel
      :games="games.data.value ?? []"
      :tables="tables.data.value ?? []"
      :editable="canManage"
      @changed="reload"
    />
  </div>
</template>
