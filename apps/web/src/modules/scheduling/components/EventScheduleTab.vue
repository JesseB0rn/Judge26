<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRightIcon, LayoutGridIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { listEventDays } from '@/modules/rankings/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import ExportButtons from '@/shared/export/ExportButtons.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import {
  listEventCategories,
  listEventJudges,
  listScheduleGames,
  listScheduleIssues,
  listTables,
} from '../api'
import { gamesTable } from '../export'
import GenerateSchedulePanel from './GenerateSchedulePanel.vue'
import ScheduleGamesPanel from './ScheduleGamesPanel.vue'
import TablesPanel from './TablesPanel.vue'

const props = defineProps<{ event: EventRecord; canManage: boolean }>()

const tables = useLoader(() => listTables(props.event.id))
const games = useLoader(() => listScheduleGames(props.event.id))
const judges = useLoader(() => listEventJudges(props.event.id))
const categories = useLoader(() => listEventCategories(props.event.id))
const issues = useLoader(() => listScheduleIssues(props.event.id))
const days = useLoader(() => listEventDays(props.event.id))

const all = [tables, games, judges, categories, issues, days]
const loading = computed(() => all.some((l) => l.loading.value))
const firstError = computed(() => all.map((l) => l.error.value).find(Boolean) ?? null)
let reloadRequested = false
let reloadPromise: Promise<void> | undefined

const labels = computed(() => {
  const map: Record<string, string> = {}
  for (const game of games.data.value ?? []) {
    const team = game.expand?.team?.name ?? t('scheduling.unknownTeam')
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
    <!-- The board is the main place to assign tables, judges and teams (M8-E). -->
    <div
      v-if="canManage"
      class="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 class="font-semibold">{{ t('scheduling.board.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('scheduling.board.description') }}</p>
      </div>
      <Button as-child size="lg" class="h-12 shrink-0 px-6 text-base" data-testid="open-board">
        <RouterLink :to="{ name: 'event-board', params: { id: event.id } }">
          <LayoutGridIcon /> {{ t('scheduling.board.open') }} <ArrowRightIcon />
        </RouterLink>
      </Button>
    </div>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <span class="text-sm text-muted-foreground">{{ t('scheduling.export.label') }}</span>
      <ExportButtons
        :title="t('scheduling.export.title', { event: event.name })"
        :tables="
          () => [
            gamesTable(games.data.value ?? [], categories.data.value ?? [], days.data.value ?? []),
          ]
        "
        :disabled="!games.data.value?.length"
      />
    </div>
    <ErrorAlert :error="firstError" />
    <p v-if="loading && !games.data.value" class="text-sm text-muted-foreground">
      {{ t('common.loading') }}
    </p>
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
