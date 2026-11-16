<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRightIcon, MapPinIcon, RefreshCwIcon, UserIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { listHeadJudgeTables } from '../api'
import type { HeadJudgeTable } from '../types'

/**
 * A head judge's judge view (M10-07): the tables of their events with category, judges and
 * progress. Choosing one opens the dashboard of that table, the same view its judges have, with
 * robot check and scoring. The board assignment is not changed; another table can be chosen any
 * time.
 */
const tables = ref<HeadJudgeTable[]>([])
const loading = ref(true)
const error = ref<AppError | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    tables.value = await listHeadJudgeTables()
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const events = computed(() => {
  const map = new Map<string, { id: string; name: string; tables: HeadJudgeTable[] }>()
  for (const table of tables.value) {
    const entry = map.get(table.event.id) ?? { ...table.event, tables: [] }
    entry.tables.push(table)
    map.set(table.event.id, entry)
  }
  return [...map.values()]
})
const percent = (table: HeadJudgeTable) =>
  table.progress.total ? Math.round((table.progress.done / table.progress.total) * 100) : 0
</script>

<template>
  <PageHeader :title="t('judging.tables.title')" :description="t('judging.tables.description')">
    <template #actions>
      <Button variant="outline" size="touch" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" /> {{ t('common.refresh') }}
      </Button>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-6" data-testid="head-judge-tables">
    <ErrorAlert :error="error" />
    <Skeleton v-if="loading && !tables.length" class="h-32 w-full" />
    <p
      v-if="!loading && !error && !tables.length"
      class="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
    >
      {{ t('judging.tables.empty') }}
    </p>

    <section v-for="event in events" :key="event.id" class="flex flex-col gap-2">
      <h2 v-if="events.length > 1" class="px-1 text-lg font-semibold">{{ event.name }}</h2>
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="table in event.tables" :key="table.id">
          <RouterLink
            :to="{ name: 'judging', query: { seat: table.id } }"
            class="flex min-h-24 items-center gap-3 rounded-xl border-2 p-4 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            :data-table="table.name"
          >
            <MapPinIcon class="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="flex flex-wrap items-baseline gap-x-2">
                <span class="text-xl font-bold">{{ table.name }}</span>
                <span class="text-sm text-muted-foreground">{{
                  table.category?.name ?? t('board.unsorted')
                }}</span>
              </span>
              <span class="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                <span
                  v-for="judge in table.judges"
                  :key="judge.id"
                  class="inline-flex items-center gap-1"
                  ><UserIcon class="size-3.5" aria-hidden="true" />{{ judge.name }}</span
                >
                <span v-if="!table.judges.length">{{ t('judging.tables.noJudges') }}</span>
              </span>
              <span class="flex items-center gap-2 text-sm">
                <span
                  class="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  :aria-valuenow="percent(table)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="t('judging.dashboard.progress', table.progress)"
                >
                  <span class="block h-full bg-primary" :style="{ width: `${percent(table)}%` }" />
                </span>
                <span class="tabular-nums" data-testid="table-progress">{{
                  t('judging.dashboard.progress', table.progress)
                }}</span>
              </span>
            </span>
            <ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
