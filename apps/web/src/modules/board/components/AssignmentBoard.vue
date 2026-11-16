<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangleIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  GripVerticalIcon,
  LockIcon,
  PlusIcon,
  UserIcon,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import FilterChips from '@/shared/components/FilterChips.vue'
import type { Board, BoardTable } from '../api'
import {
  dividerMove,
  endOf,
  groupTables,
  isLocked,
  judgeConflicts,
  judgeSlots,
  selectInTray,
  shownRound,
  teamsOn,
  unassignedJudges,
  unassignedTeams,
  type Scope,
} from '../lib'
import { useBoardDrag, type DragPayload, type DropTarget } from '../useBoardDrag'

/**
 * The assignment board (M8-25 – M8-30, M8-33): tables as columns grouped by category, each with
 * judge slots and its teams in sequence order; unassigned teams and judges in trays. Everything
 * that can be dragged can also be done from the item's menu. Category groups wrap onto further
 * rows (M10-27); several unassigned teams can be selected and placed together (M10-28).
 *
 * `busy` (a write is running) pauses editing without changing the layout: removing controls
 * while saving shifted the board and made its scroll position jump (M10-26).
 */
const props = defineProps<{ board: Board; scope: Scope; editable: boolean; busy?: boolean }>()
const emit = defineEmits<{
  moveTeam: [team: string, table: string, index: number]
  moveTeams: [teams: string[], table: string, index: number]
  moveJudge: [judge: string, from: string, to: string]
  moveTables: [tables: BoardTable[], category: string]
  addTable: [category: string]
  renameTable: [table: BoardTable]
  toggleTable: [table: BoardTable]
  deleteTable: [table: BoardTable]
  setSlots: [category: string, slots: number]
}>()

const trayCategory = ref('')
const groups = computed(() => groupTables(props.board))
const teamsById = computed(() => new Map(props.board.teams.map((team) => [team.id, team])))
const judgesById = computed(() => new Map(props.board.judges.map((judge) => [judge.id, judge])))
const conflicts = computed(() => judgeConflicts(props.board))
const freeTeams = computed(() =>
  unassignedTeams(props.board, props.scope).filter(
    (team) => !trayCategory.value || team.category === trayCategory.value,
  ),
)
const freeJudges = computed(() => unassignedJudges(props.board))

/** Tables a team may go to: active tables of its category, if the scope has a round there. */
function tablesFor(teamId: string) {
  const team = teamsById.value.get(teamId)
  if (!team || !shownRound(props.board, team.category, props.scope)) return []
  return props.board.tables.filter((t) => t.active && t.category === team.category)
}

function tableOf(id: string) {
  return props.board.tables.find((t) => t.id === id)
}

/** Editing is possible right now (not while a write is running). */
const canEdit = computed(() => props.editable && !props.busy)

// --- Tray selection (M10-28) -------------------------------------------------------------

const selection = ref<string[]>([])
const anchor = ref('')
const selected = computed(() => new Set(selection.value))
// Teams that left the tray (placed, or filtered out) leave the selection.
watch(freeTeams, (teams) => {
  const free = new Set(teams.map((team) => team.id))
  if (selection.value.some((id) => !free.has(id))) {
    selection.value = selection.value.filter((id) => free.has(id))
  }
})

function onTrayClick(event: MouseEvent | KeyboardEvent, team: string) {
  if (!props.editable) return
  const next = selectInTray(
    freeTeams.value.map((x) => x.id),
    selection.value,
    anchor.value,
    team,
    {
      shift: event.shiftKey,
      // A plain click on the only selected team clears it again.
      toggle:
        event.ctrlKey ||
        event.metaKey ||
        (selection.value.length === 1 && selection.value[0] === team && !event.shiftKey),
    },
  )
  selection.value = next.selected
  anchor.value = next.anchor
}

function clearSelection() {
  selection.value = []
  anchor.value = ''
}

function onWindowKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && selection.value.length && !drag.value) clearSelection()
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey))

/** The teams a tray card's drag or menu acts on: the selection if the card is part of it. */
function trayGroup(team: string): string[] {
  return selected.value.has(team) && selection.value.length > 1 ? selection.value : [team]
}

/** Tables every one of these teams may go to. */
function tablesForAll(teams: string[]) {
  const [first, ...rest] = teams
  if (!first) return []
  return tablesFor(first).filter((table) =>
    rest.every((id) => tablesFor(id).some((t) => t.id === table.id)),
  )
}

function placeGroup(teams: string[], table: string, index: number) {
  if (teams.length > 1) emit('moveTeams', teams, table, index)
  else emit('moveTeam', teams[0]!, table, index)
}

// --- Drag and drop -------------------------------------------------------------------------

function valid(payload: DragPayload, target: DropTarget): boolean {
  if (payload.kind === 'team') {
    if (target.kind === 'team-tray') return !!payload.from
    if (target.kind !== 'teams') return false
    // Several teams: every one of them must fit the table, or none is placed (M10-28).
    return tablesForAll(payload.teams ?? [payload.team]).some((t) => t.id === target.table)
  }
  if (payload.kind === 'judge') {
    if (target.kind === 'judge-tray') return !!payload.from
    if (target.kind !== 'judges' || target.table === payload.from) return false
    const table = tableOf(target.table)
    return !!table && !table.judges.includes(payload.judge)
  }
  return target.kind === 'column' && !!dividerMove(groups.value, payload.group, target.before)
}

function onDrop(payload: DragPayload, target: DropTarget) {
  if (!valid(payload, target)) return
  if (payload.kind === 'team') {
    if (target.kind === 'teams' && payload.teams && payload.teams.length > 1) {
      emit('moveTeams', payload.teams, target.table, target.index)
    } else if (target.kind === 'teams') {
      // Moving down within the same table: the index counts the card itself.
      const current = payload.from === target.table ? order(target.table).indexOf(payload.team) : -1
      const index = current !== -1 && current < target.index ? target.index - 1 : target.index
      if (current === index) return
      emit('moveTeam', payload.team, target.table, index)
    } else emit('moveTeam', payload.team, '', 0)
  } else if (payload.kind === 'judge') {
    emit('moveJudge', payload.judge, payload.from, target.kind === 'judges' ? target.table : '')
  } else if (target.kind === 'column') {
    const move = dividerMove(groups.value, payload.group, target.before)
    if (move) emit('moveTables', move.tables, move.category)
  }
}

const { drag, start } = useBoardDrag(onDrop)
const dropOk = computed(() =>
  drag.value?.active && drag.value.target ? valid(drag.value.payload, drag.value.target) : null,
)

function startTeam(event: PointerEvent, team: string, from: string, table?: BoardTable) {
  if (!canEdit.value || (table && isLocked(props.board, team, table, props.scope))) return
  const teams = from ? [team] : trayGroup(team)
  start(
    event,
    { kind: 'team', team, from, ...(teams.length > 1 ? { teams } : {}) },
    teams.length > 1
      ? t('board.teamsSelected', { count: teams.length })
      : (teamsById.value.get(team)?.name ?? ''),
  )
}
function startJudge(event: PointerEvent, judge: string, from: string) {
  if (!canEdit.value) return
  start(event, { kind: 'judge', judge, from }, judgesById.value.get(judge)?.name ?? '')
}
function startDivider(event: PointerEvent, group: number) {
  if (!canEdit.value) return
  start(event, { kind: 'divider', group }, groups.value[group]?.category?.name ?? '')
}

/** Highlight of a drop zone while dragging over it. */
function zoneClass(matches: (target: DropTarget) => boolean) {
  const d = drag.value
  if (!d?.active || !d.target || !matches(d.target)) return ''
  return dropOk.value ? 'ring-2 ring-ring bg-ring/10' : 'ring-2 ring-destructive bg-destructive/10'
}

const order = (tableId: string) => {
  const table = tableOf(tableId)
  return table ? teamsOn(props.board, table, props.scope) : []
}

/** Where the dragged team would be inserted on this table (a line between cards). */
function insertAt(tableId: string): number {
  const d = drag.value
  if (!d?.active || d.target?.kind !== 'teams' || d.target.table !== tableId || !dropOk.value)
    return -1
  return d.target.index
}

/** Whether a card is part of the dragged teams. */
function isDragged(team: string) {
  const d = drag.value
  if (!d?.active || d.payload.kind !== 'team') return false
  return d.payload.team === team || !!d.payload.teams?.includes(team)
}

// --- Scroll position (M10-26) ---------------------------------------------------------
// A new board (after a write or a live update) must not move what the manager looks at: keep
// each group's horizontal scroll and the page's vertical scroll.

const root = ref<HTMLElement>()
let kept: { groups: Map<string, number>; pageY: number } | null = null
watch(
  () => props.board,
  () => {
    const groups = new Map<string, number>()
    root.value
      ?.querySelectorAll<HTMLElement>('[data-group]')
      .forEach((el) => groups.set(el.dataset.group!, el.scrollLeft))
    kept = { groups, pageY: window.scrollY }
  },
  { flush: 'pre' },
)
watch(
  () => props.board,
  () => {
    if (!kept) return
    const { groups, pageY } = kept
    kept = null
    root.value?.querySelectorAll<HTMLElement>('[data-group]').forEach((el) => {
      const left = groups.get(el.dataset.group!)
      if (left !== undefined && el.scrollLeft !== left) el.scrollLeft = left
    })
    if (window.scrollY !== pageY) window.scrollTo({ top: pageY })
  },
  { flush: 'post' },
)

function nextOf(groupIndex: number, tableIndex: number) {
  const group = groups.value[groupIndex]!
  const next = group.tables[tableIndex + 1]
  return next ? next.id : (groups.value[groupIndex + 1]?.tables[0]?.id ?? endOf(groupIndex))
}
</script>

<template>
  <div
    ref="root"
    class="flex flex-col gap-4 lg:flex-row lg:items-start"
    :class="{ 'select-none': drag?.active }"
    :aria-busy="busy || undefined"
    data-testid="assignment-board"
  >
    <!-- Trays (M8-30) -->
    <aside class="flex shrink-0 flex-col gap-4 lg:w-56">
      <section
        class="rounded-lg border p-3"
        data-drop="team-tray"
        data-testid="team-tray"
        :class="zoneClass((t) => t.kind === 'team-tray')"
      >
        <h2 class="mb-2 text-sm font-semibold">
          {{ t('board.unassignedTeams', { count: freeTeams.length }) }}
        </h2>
        <p
          v-if="editable && selection.length"
          class="mb-2 flex items-center gap-2 text-xs text-muted-foreground"
          data-testid="tray-selection"
        >
          {{ t('board.selectedCount', { count: selection.length }) }}
          <button type="button" class="underline underline-offset-2" @click="clearSelection">
            {{ t('board.clearSelection') }}
          </button>
        </p>
        <p v-else-if="editable && freeTeams.length > 1" class="mb-2 text-xs text-muted-foreground">
          {{ t('board.selectHint') }}
        </p>
        <FilterChips
          v-if="board.categories.length > 1"
          v-model="trayCategory"
          class="mb-2"
          :label="t('board.category')"
          :options="board.categories.map((c) => ({ value: c.id, label: c.code || c.name }))"
        />
        <ul
          class="flex max-h-[50vh] flex-col gap-1 overflow-y-auto"
          role="listbox"
          aria-multiselectable="true"
          :aria-label="t('board.unassignedTeams', { count: freeTeams.length })"
        >
          <li
            v-for="team in freeTeams"
            :key="team.id"
            class="flex items-center gap-1 rounded-md border px-2 py-1 text-sm select-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="[
              editable ? 'cursor-grab touch-none' : '',
              selected.has(team.id) ? 'border-ring bg-ring/15' : 'bg-background',
              isDragged(team.id) ? 'opacity-40' : '',
            ]"
            role="option"
            :tabindex="editable ? 0 : -1"
            :aria-selected="selected.has(team.id)"
            :data-team="team.name"
            :data-selected="selected.has(team.id) || undefined"
            @pointerdown="startTeam($event, team.id, '')"
            @click="onTrayClick($event, team.id)"
            @keydown.space.prevent="onTrayClick($event, team.id)"
          >
            <span class="min-w-0 flex-1 truncate">{{ team.name }}</span>
            <span class="text-xs text-muted-foreground">{{
              board.categories.find((c) => c.id === team.category)?.code
            }}</span>
            <DropdownMenu v-if="editable">
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :disabled="busy"
                  :aria-label="t('board.teamActions', { team: team.name })"
                  @pointerdown.stop
                  @click.stop
                  ><EllipsisVerticalIcon
                /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{{
                  trayGroup(team.id).length > 1
                    ? t('board.placeSelectedOn', { count: trayGroup(team.id).length })
                    : t('board.placeOn')
                }}</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="table in tablesForAll(trayGroup(team.id))"
                  :key="table.id"
                  @select="placeGroup(trayGroup(team.id), table.id, order(table.id).length)"
                  >{{ table.name }}</DropdownMenuItem
                >
                <DropdownMenuItem v-if="!tablesForAll(trayGroup(team.id)).length" disabled>{{
                  t('board.noTable')
                }}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
          <li v-if="!freeTeams.length" class="text-sm text-muted-foreground">
            {{ t('board.allPlaced') }}
          </li>
        </ul>
      </section>

      <section
        class="rounded-lg border p-3"
        data-drop="judge-tray"
        data-testid="judge-tray"
        :class="zoneClass((t) => t.kind === 'judge-tray')"
      >
        <h2 class="mb-2 text-sm font-semibold">
          {{ t('board.unassignedJudges', { count: freeJudges.length }) }}
        </h2>
        <ul class="flex flex-col gap-1">
          <li
            v-for="judge in freeJudges"
            :key="judge.id"
            class="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-sm select-none"
            :class="editable ? 'cursor-grab touch-none' : ''"
            :data-judge="judge.name"
            @pointerdown="startJudge($event, judge.id, '')"
          >
            <UserIcon class="size-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ judge.name }}</span>
            <DropdownMenu v-if="editable">
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  :disabled="busy"
                  :aria-label="t('board.judgeActions', { judge: judge.name })"
                  @pointerdown.stop
                  ><EllipsisVerticalIcon
                /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{{ t('board.assignTo') }}</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="table in board.tables.filter((t) => t.active)"
                  :key="table.id"
                  @select="emit('moveJudge', judge.id, '', table.id)"
                  >{{ table.name }}</DropdownMenuItem
                >
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
          <li v-if="!freeJudges.length" class="text-sm text-muted-foreground">
            {{ t('board.allJudgesPlaced') }}
          </li>
        </ul>
      </section>
    </aside>

    <!-- Board (M8-25); category groups wrap onto further rows (M10-27) -->
    <div class="min-w-0 flex-1 pb-2">
      <div class="flex flex-wrap items-stretch gap-x-3 gap-y-4" data-testid="board-groups">
        <div
          v-for="(group, g) in groups"
          :key="group.category?.id ?? 'unsorted'"
          class="flex max-w-full min-w-0 items-stretch gap-2 overflow-x-auto pb-1"
          :data-group="group.category?.id ?? 'unsorted'"
          data-testid="category-group"
        >
          <!-- Category divider (M8-27) -->
          <div
            class="flex w-10 shrink-0 flex-col items-center gap-2 rounded-md bg-muted py-2"
            :class="[
              editable && g > 0 ? 'cursor-grab touch-none select-none' : '',
              drag?.active && drag.payload.kind === 'divider' && drag.payload.group === g
                ? 'opacity-50'
                : '',
            ]"
            :data-divider="group.category?.code ?? 'unsorted'"
            data-testid="category-divider"
            @pointerdown="g > 0 && startDivider($event, g)"
          >
            <GripVerticalIcon v-if="editable && g > 0" class="size-4 text-muted-foreground" />
            <span
              class="text-sm font-semibold whitespace-nowrap [writing-mode:vertical-rl]"
              :title="group.category?.name"
              >{{ group.category?.name ?? t('board.unsorted') }}</span
            >
            <DropdownMenu v-if="editable && group.category">
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  class="mt-auto"
                  :disabled="busy"
                  :aria-label="t('board.categoryActions', { category: group.category.name })"
                  @pointerdown.stop
                  ><EllipsisVerticalIcon
                /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem @select="emit('addTable', group.category.id)"
                  ><PlusIcon /> {{ t('board.addTable') }}</DropdownMenuItem
                >
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{{ t('board.judgesPerTable') }}</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="n in [1, 2, 3, 4]"
                  :key="n"
                  @select="emit('setSlots', group.category.id, n)"
                  >{{ n }}
                  <CheckIcon
                    v-if="n === group.category.judges_per_table"
                    class="ml-auto"
                    aria-hidden="true"
                /></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <!-- Tables of the group -->
          <section
            v-for="(table, i) in group.tables"
            :key="table.id"
            class="flex w-52 shrink-0 flex-col gap-2 rounded-lg border p-2"
            :class="[
              table.active ? '' : 'opacity-60',
              zoneClass((t) => t.kind === 'column' && t.before === table.id),
            ]"
            data-drop="column"
            :data-table="table.id"
            :data-next="nextOf(g, i)"
            :data-column="table.name"
          >
            <header class="flex items-center gap-1">
              <h3 class="min-w-0 flex-1 truncate font-semibold">{{ table.name }}</h3>
              <span v-if="!table.active" class="text-xs text-destructive">{{
                t('board.inactive')
              }}</span>
              <DropdownMenu v-if="editable">
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    :disabled="busy"
                    :aria-label="t('board.tableActions', { table: table.name })"
                    ><EllipsisVerticalIcon
                  /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem @select="emit('renameTable', table)">{{
                    t('board.rename')
                  }}</DropdownMenuItem>
                  <DropdownMenuItem @select="emit('toggleTable', table)">{{
                    table.active ? t('board.deactivate') : t('board.activate')
                  }}</DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    :disabled="board.games.some((g) => g.table === table.id)"
                    @select="emit('deleteTable', table)"
                    >{{ t('board.delete') }}</DropdownMenuItem
                  >
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{{ t('board.moveToCategory') }}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        v-for="category in board.categories.filter((c) => c.id !== table.category)"
                        :key="category.id"
                        @select="emit('moveTables', [table], category.id)"
                        >{{ category.name }}</DropdownMenuItem
                      >
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <!-- Judge slots (M8-29) -->
            <ul
              class="flex flex-col gap-1 rounded-md p-1"
              data-drop="judges"
              :data-table="table.id"
              :data-testid="`judges-${table.name}`"
              :class="zoneClass((t) => t.kind === 'judges' && t.table === table.id)"
            >
              <li
                v-for="judgeId in table.judges"
                :key="judgeId"
                class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm select-none"
                :class="[
                  editable ? 'cursor-grab touch-none' : '',
                  conflicts.has(judgeId)
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950'
                    : 'bg-background',
                ]"
                :data-judge="judgesById.get(judgeId)?.name"
                @pointerdown="startJudge($event, judgeId, table.id)"
              >
                <AlertTriangleIcon
                  v-if="conflicts.has(judgeId)"
                  class="size-3.5 shrink-0 text-amber-600"
                  :aria-label="t('board.judgeConflict')"
                  data-testid="judge-conflict"
                />
                <UserIcon v-else class="size-3.5 shrink-0" />
                <span class="min-w-0 flex-1 truncate">{{
                  judgesById.get(judgeId)?.name ?? '?'
                }}</span>
                <DropdownMenu v-if="editable">
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      :disabled="busy"
                      :aria-label="
                        t('board.judgeActions', { judge: judgesById.get(judgeId)?.name ?? '' })
                      "
                      @pointerdown.stop
                      ><EllipsisVerticalIcon
                    /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>{{ t('board.moveTo') }}</DropdownMenuLabel>
                    <DropdownMenuItem
                      v-for="other in board.tables.filter(
                        (t) => t.active && t.id !== table.id && !t.judges.includes(judgeId),
                      )"
                      :key="other.id"
                      @select="emit('moveJudge', judgeId, table.id, other.id)"
                      >{{ other.name }}</DropdownMenuItem
                    >
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @select="emit('moveJudge', judgeId, table.id, '')">{{
                      t('board.removeJudge')
                    }}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
              <li
                v-for="n in Math.max(0, judgeSlots(board, table) - table.judges.length)"
                :key="`free-${n}`"
                class="rounded-full border border-dashed px-2 py-0.5 text-sm text-muted-foreground"
              >
                {{ t('board.judgeSlot') }}
              </li>
            </ul>

            <!-- Teams in sequence order (M8-28) -->
            <ol
              class="flex min-h-16 flex-1 flex-col gap-1 rounded-md p-1"
              data-drop="teams"
              :data-table="table.id"
              :data-testid="`teams-${table.name}`"
              :class="zoneClass((t) => t.kind === 'teams' && t.table === table.id)"
            >
              <template v-for="(teamId, slot) in order(table.id)" :key="teamId">
                <li v-if="insertAt(table.id) === slot" class="h-0.5 rounded bg-ring" />
                <li
                  class="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm select-none"
                  :class="[
                    editable && !isLocked(board, teamId, table, scope)
                      ? 'cursor-grab touch-none'
                      : '',
                    isDragged(teamId) ? 'opacity-40' : '',
                  ]"
                  data-team-slot
                  :data-team="teamsById.get(teamId)?.name"
                  @pointerdown="startTeam($event, teamId, table.id, table)"
                >
                  <span class="w-5 text-xs text-muted-foreground tabular-nums">{{ slot + 1 }}</span>
                  <span class="min-w-0 flex-1 truncate">{{
                    teamsById.get(teamId)?.name ?? '?'
                  }}</span>
                  <LockIcon
                    v-if="isLocked(board, teamId, table, scope)"
                    class="size-3.5 text-muted-foreground"
                    :aria-label="t('board.locked')"
                  />
                  <DropdownMenu v-else-if="editable">
                    <DropdownMenuTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        :disabled="busy"
                        :aria-label="
                          t('board.teamActions', { team: teamsById.get(teamId)?.name ?? '' })
                        "
                        @pointerdown.stop
                        ><EllipsisVerticalIcon
                      /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        :disabled="slot === 0"
                        @select="emit('moveTeam', teamId, table.id, slot - 1)"
                        >{{ t('board.moveUp') }}</DropdownMenuItem
                      >
                      <DropdownMenuItem
                        :disabled="slot === order(table.id).length - 1"
                        @select="emit('moveTeam', teamId, table.id, slot + 1)"
                        >{{ t('board.moveDown') }}</DropdownMenuItem
                      >
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>{{ t('board.moveTo') }}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem
                            v-for="other in tablesFor(teamId).filter((t) => t.id !== table.id)"
                            :key="other.id"
                            @select="emit('moveTeam', teamId, other.id, order(other.id).length)"
                            >{{ other.name }}</DropdownMenuItem
                          >
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @select="emit('moveTeam', teamId, '', 0)">{{
                        t('board.takeOff')
                      }}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              </template>
              <li
                v-if="insertAt(table.id) === order(table.id).length"
                class="h-0.5 rounded bg-ring"
              />
              <li
                v-if="!order(table.id).length && !table.category"
                class="text-xs text-muted-foreground"
              >
                {{ t('board.unsortedHint') }}
              </li>
            </ol>
          </section>

          <!-- Add a table at the end of the group (M8-26) -->
          <button
            v-if="editable && group.category"
            type="button"
            class="flex w-10 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted disabled:opacity-50"
            :disabled="busy"
            :aria-label="t('board.addTableTo', { category: group.category.name })"
            :title="t('board.addTableTo', { category: group.category.name })"
            @click="emit('addTable', group.category.id)"
          >
            <PlusIcon class="size-4" />
          </button>
        </div>
        <p v-if="!board.categories.length" class="text-sm text-muted-foreground">
          {{ t('board.noCategories') }}
        </p>
      </div>
    </div>

    <!-- What is being dragged follows the pointer. -->
    <div
      v-if="drag?.active"
      class="pointer-events-none fixed z-50 rounded-md border bg-background px-2 py-1 text-sm shadow-lg"
      :class="dropOk === false ? 'border-destructive' : ''"
      :style="{ left: `${drag.x + 12}px`, top: `${drag.y + 8}px` }"
      data-testid="drag-ghost"
    >
      {{ drag.label }}
      <span v-if="dropOk === false" class="block text-xs text-destructive">{{
        drag.payload.kind === 'team' ? t('board.wrongCategory') : t('board.cannotDrop')
      }}</span>
    </div>
  </div>
</template>
