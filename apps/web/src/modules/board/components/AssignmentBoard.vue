<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref } from 'vue'
import {
  AlertTriangleIcon,
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
 * that can be dragged can also be done from the item's menu.
 */
const props = defineProps<{ board: Board; scope: Scope; editable: boolean }>()
const emit = defineEmits<{
  moveTeam: [team: string, table: string, index: number]
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

// --- Drag and drop -------------------------------------------------------------------------

function valid(payload: DragPayload, target: DropTarget): boolean {
  if (payload.kind === 'team') {
    if (target.kind === 'team-tray') return !!payload.from
    if (target.kind !== 'teams') return false
    return tablesFor(payload.team).some((t) => t.id === target.table)
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
    if (target.kind === 'teams') {
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
  if (!props.editable || (table && isLocked(props.board, team, table, props.scope))) return
  start(event, { kind: 'team', team, from }, teamsById.value.get(team)?.name ?? '')
}
function startJudge(event: PointerEvent, judge: string, from: string) {
  if (!props.editable) return
  start(event, { kind: 'judge', judge, from }, judgesById.value.get(judge)?.name ?? '')
}
function startDivider(event: PointerEvent, group: number) {
  if (!props.editable) return
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

function nextOf(groupIndex: number, tableIndex: number) {
  const group = groups.value[groupIndex]!
  const next = group.tables[tableIndex + 1]
  return next ? next.id : (groups.value[groupIndex + 1]?.tables[0]?.id ?? endOf(groupIndex))
}
</script>

<template>
  <div
    class="flex flex-col gap-4 lg:flex-row lg:items-start"
    :class="{ 'select-none': drag?.active }"
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
        <FilterChips
          v-if="board.categories.length > 1"
          v-model="trayCategory"
          class="mb-2"
          :label="t('board.category')"
          :options="board.categories.map((c) => ({ value: c.id, label: c.code || c.name }))"
        />
        <ul class="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          <li
            v-for="team in freeTeams"
            :key="team.id"
            class="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm"
            :class="editable ? 'cursor-grab touch-none' : ''"
            :data-team="team.name"
            @pointerdown="startTeam($event, team.id, '')"
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
                  :aria-label="t('board.teamActions', { team: team.name })"
                  @pointerdown.stop
                  ><EllipsisVerticalIcon
                /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{{ t('board.placeOn') }}</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="table in tablesFor(team.id)"
                  :key="table.id"
                  @select="emit('moveTeam', team.id, table.id, order(table.id).length)"
                  >{{ table.name }}</DropdownMenuItem
                >
                <DropdownMenuItem v-if="!tablesFor(team.id).length" disabled>{{
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
            class="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-sm"
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

    <!-- Board (M8-25) -->
    <div class="min-w-0 flex-1 overflow-x-auto pb-2">
      <div class="flex items-stretch gap-2">
        <template v-for="(group, g) in groups" :key="group.category?.id ?? 'unsorted'">
          <!-- Category divider (M8-27) -->
          <div
            class="flex w-10 shrink-0 flex-col items-center gap-2 rounded-md bg-muted py-2"
            :class="[
              editable && g > 0 ? 'cursor-grab touch-none' : '',
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
                  >{{ n }}{{ n === group.category.judges_per_table ? ' ✓' : '' }}</DropdownMenuItem
                >
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
                class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
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
                  class="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm"
                  :class="[
                    editable && !isLocked(board, teamId, table, scope)
                      ? 'cursor-grab touch-none'
                      : '',
                    drag?.active && drag.payload.kind === 'team' && drag.payload.team === teamId
                      ? 'opacity-40'
                      : '',
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
            class="flex w-10 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-muted"
            :aria-label="t('board.addTableTo', { category: group.category.name })"
            :title="t('board.addTableTo', { category: group.category.name })"
            @click="emit('addTable', group.category.id)"
          >
            <PlusIcon class="size-4" />
          </button>
        </template>
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
