<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { RefreshCwIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import AssignmentBoard from './AssignmentBoard.vue'
import {
  createTable,
  deleteTable,
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
 * Assignment board of an event (M8-E), in the event's Schedule tab: managers create tables and
 * assign teams and judges. Other open boards update live; a write based on an outdated board
 * reloads it (M8-32). Emits `changed` after every write, so the rest of the tab can reload.
 */
const props = defineProps<{ eventId: string; editable: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const board = ref<Board>()
const loadError = ref<AppError>()
const actionError = ref<AppError>()
const busy = ref(false)
const scopeValue = ref('all')
const scope = computed<Scope>(() =>
  scopeValue.value === 'all' ? 'all' : Number.parseInt(scopeValue.value, 10),
)

const rounds = computed(() => (board.value ? roundCount(board.value) : 0))

async function reload() {
  try {
    board.value = await loadBoard(props.eventId)
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
    emit('changed')
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
    moveTeam(props.eventId, {
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
  void write(() => moveJudge(props.eventId, { judge, from, to, expected }))
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
      result = await setTableCategory(props.eventId, fresh, category, affected > 0)
    }
    return result
  })
}

function onAddTable(category: string) {
  void write(() => createTable(props.eventId, category))
}

function onRenameTable(table: BoardTable) {
  const name = prompt(t('board.renamePrompt'), table.name)?.trim()
  if (!name || name === table.name) return
  void write(async () => {
    await updateTable(table, { name })
    return loadBoard(props.eventId)
  })
}

function onToggleTable(table: BoardTable) {
  void write(async () => {
    await updateTable(table, { active: !table.active })
    return loadBoard(props.eventId)
  })
}

function onDeleteTable(table: BoardTable) {
  if (!confirm(t('board.confirmDelete', { table: table.name }))) return
  void write(async () => {
    await deleteTable(table)
    return loadBoard(props.eventId)
  })
}

function onSetSlots(category: string, slots: number) {
  void write(async () => {
    await setJudgesPerTable(category, slots)
    return loadBoard(props.eventId)
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
  await reload()
  try {
    unsubscribe = await subscribeBoard(props.eventId, onRemoteChange)
  } catch {
    // Without realtime the board still works; it reloads after each write.
  }
})
watch(() => props.eventId, reload)
onBeforeUnmount(() => {
  clearTimeout(timer)
  unsubscribe?.()
})

defineExpose({ reload })
</script>

<template>
  <section class="flex flex-col gap-3" data-testid="event-board">
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="text-lg font-semibold">{{ t('board.heading') }}</h2>
      <label v-if="board" class="flex items-center gap-2 text-sm">
        {{ t('board.scope') }}
        <NativeSelect v-model="scopeValue" data-testid="board-scope">
          <NativeSelectOption value="all">{{ t('board.allRounds') }}</NativeSelectOption>
          <NativeSelectOption v-for="n in rounds" :key="n" :value="String(n - 1)">{{
            t('board.roundOnly', { n })
          }}</NativeSelectOption>
        </NativeSelect>
      </label>
      <span v-if="board" class="text-sm text-muted-foreground">{{
        scope === 'all' ? t('board.allRoundsHint') : t('board.roundOnlyHint')
      }}</span>
      <Button variant="outline" size="sm" class="ml-auto" :disabled="busy" @click="reload()">
        <RefreshCwIcon /> {{ t('board.reload') }}
      </Button>
    </div>
    <p class="text-sm text-muted-foreground">{{ t('board.description') }}</p>
    <ErrorAlert :error="loadError ?? actionError" />
    <AssignmentBoard
      v-if="board"
      :board="board"
      :scope="scope"
      :editable="editable && !busy"
      @move-team="onMoveTeam"
      @move-judge="onMoveJudge"
      @move-tables="onMoveTables"
      @add-table="onAddTable"
      @rename-table="onRenameTable"
      @toggle-table="onToggleTable"
      @delete-table="onDeleteTable"
      @set-slots="onSetSlots"
    />
    <Skeleton v-else-if="!loadError" class="h-64 w-full" />
  </section>
</template>
