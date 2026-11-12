<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { ArrowLeftIcon, RefreshCwIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { pb } from '@/shared/api/pocketbase'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import type { EventRecord } from '@/shared/types/records'
import AssignmentBoard from '../components/AssignmentBoard.vue'
import {
  createTable,
  isConflict,
  loadBoard,
  moveJudge,
  moveTeam,
  setJudgesPerTable,
  setTableCategory,
  subscribeBoard,
  updateTable,
  type Board,
  type BoardTable,
} from '../api'
import { categoryRounds, expectedForMove, roundCount, type Scope } from '../lib'

/**
 * Assignment board of an event (M8-E): managers create tables and assign teams and judges.
 * Other open boards update live; a write based on an outdated board reloads it (M8-32).
 */
const props = defineProps<{ id: string }>()
const session = useSessionStore()
const event = ref<EventRecord>()
const board = ref<Board>()
const loadError = ref<AppError>()
const actionError = ref<AppError>()
const busy = ref(false)
const scopeValue = ref('all')
const scope = computed<Scope>(() =>
  scopeValue.value === 'all' ? 'all' : Number.parseInt(scopeValue.value, 10),
)

const canManage = computed(() => session.canManageEvent(props.id))
const editable = computed(() => canManage.value && event.value?.status !== 'archived')
const rounds = computed(() => (board.value ? roundCount(board.value) : 0))

async function reload() {
  try {
    board.value = await loadBoard(props.id)
    loadError.value = undefined
  } catch (e) {
    loadError.value = toAppError(e)
  }
}

/** Runs a write; the response is the new board. A conflict reloads instead (M8-32). */
async function write(action: () => Promise<Board>) {
  if (busy.value) return
  busy.value = true
  actionError.value = undefined
  try {
    board.value = await action()
  } catch (e) {
    if (isConflict(e)) {
      toast.warning(t('board.changedMeanwhile'))
      await reload()
    } else actionError.value = toAppError(e)
  } finally {
    busy.value = false
  }
}

function onMoveTeam(team: string, table: string, index: number) {
  const current = board.value!
  const category = current.teams.find((x) => x.id === team)?.category ?? ''
  const round = scope.value === 'all' ? undefined : categoryRounds(current, category)[scope.value]
  void write(() =>
    moveTeam(props.id, {
      team,
      table,
      index,
      ...(round ? { round: round.id } : {}),
      expected: expectedForMove(current, team, table, scope.value),
    }),
  )
}

function onMoveJudge(judge: string, from: string, to: string) {
  const current = board.value!
  const expected = Object.fromEntries(
    current.tables.filter((x) => x.id === from || x.id === to).map((x) => [x.id, x.updated]),
  )
  void write(() => moveJudge(props.id, { judge, from, to, expected }))
}

/** Moves tables into a category, after confirming when teams of the old one are on them. */
function onMoveTables(tables: BoardTable[], category: string) {
  const current = board.value!
  const roundCategory = new Map(current.rounds.map((r) => [r.id, r.category]))
  const ids = new Set(tables.map((x) => x.id))
  const affected = current.games.filter(
    (g) => ids.has(g.table) && roundCategory.get(g.round) !== category,
  ).length
  const name = current.categories.find((c) => c.id === category)?.name ?? ''
  if (
    affected &&
    !confirm(t('board.confirmCategory', { count: affected, tables: tables.length, category: name }))
  ) {
    return
  }
  void write(async () => {
    let result = current
    for (const table of tables) {
      const fresh = result.tables.find((x) => x.id === table.id) ?? table
      result = await setTableCategory(props.id, fresh, category, affected > 0)
    }
    return result
  })
}

function onAddTable(category: string) {
  void write(() => createTable(props.id, category))
}

function onRenameTable(table: BoardTable) {
  const name = prompt(t('board.renamePrompt'), table.name)?.trim()
  if (!name || name === table.name) return
  void write(async () => {
    await updateTable(table, { name })
    return loadBoard(props.id)
  })
}

function onToggleTable(table: BoardTable) {
  void write(async () => {
    await updateTable(table, { active: !table.active })
    return loadBoard(props.id)
  })
}

function onSetSlots(category: string, slots: number) {
  void write(async () => {
    await setJudgesPerTable(category, slots)
    return loadBoard(props.id)
  })
}

// Live updates from other boards (debounced; our own writes already returned the board).
let unsubscribe: (() => void) | undefined
let timer: ReturnType<typeof setTimeout> | undefined
function onRemoteChange() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!busy.value) void reload()
  }, 400)
}

onMounted(async () => {
  if (!canManage.value) return
  try {
    event.value = await pb.collection('events').getOne<EventRecord>(props.id)
  } catch (e) {
    loadError.value = toAppError(e)
    return
  }
  await reload()
  try {
    unsubscribe = await subscribeBoard(props.id, onRemoteChange)
  } catch {
    // Without realtime the board still works; it reloads after each write.
  }
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  unsubscribe?.()
})
</script>

<template>
  <div>
    <PageHeader
      :title="t('board.title', { event: event?.name ?? '' })"
      :description="t('board.description')"
    >
      <template #actions>
        <Button as-child variant="outline">
          <RouterLink :to="{ name: 'event', params: { id } }"
            ><ArrowLeftIcon /> {{ t('board.backToEvent') }}</RouterLink
          >
        </Button>
        <Button variant="outline" :disabled="busy" @click="reload()">
          <RefreshCwIcon /> {{ t('board.reload') }}
        </Button>
      </template>
    </PageHeader>

    <ErrorAlert :error="loadError" />
    <template v-if="!canManage && !loadError">
      <p class="text-muted-foreground">{{ t('board.managersOnly') }}</p>
    </template>
    <template v-else-if="board">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm">
          {{ t('board.scope') }}
          <NativeSelect v-model="scopeValue" data-testid="board-scope">
            <NativeSelectOption value="all">{{ t('board.allRounds') }}</NativeSelectOption>
            <NativeSelectOption v-for="n in rounds" :key="n" :value="String(n - 1)">{{
              t('board.roundOnly', { n })
            }}</NativeSelectOption>
          </NativeSelect>
        </label>
        <span class="text-sm text-muted-foreground">{{
          scope === 'all' ? t('board.allRoundsHint') : t('board.roundOnlyHint')
        }}</span>
      </div>
      <ErrorAlert :error="actionError" />
      <AssignmentBoard
        :board="board"
        :scope="scope"
        :editable="editable && !busy"
        @move-team="onMoveTeam"
        @move-judge="onMoveJudge"
        @move-tables="onMoveTables"
        @add-table="onAddTable"
        @rename-table="onRenameTable"
        @toggle-table="onToggleTable"
        @set-slots="onSetSlots"
      />
    </template>
    <Skeleton v-else-if="!loadError" class="h-64 w-full" />
  </div>
</template>
