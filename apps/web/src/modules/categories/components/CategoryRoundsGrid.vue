<script setup lang="ts">
import { t } from '@/i18n'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import {
  CalculatorIcon,
  CopyIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TrophyIcon,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import type {
  CategoryRecord,
  CompetitionDayRecord,
  GameRuleRecord,
  RoundRecord,
} from '@/shared/types/records'
import RoundForm from '@/modules/rankings/components/RoundForm.vue'
import {
  listEventDays,
  listEventGameRules,
  listEventRounds,
  listEventRulesetStates,
  listEventScoringPhases,
  type RulesetState,
  type ScoringPhase,
} from '../api'
import { buildGrid, cellLabel, dayName, type GridCell, type GridRow } from '../grid'

/**
 * M11-01 – M11-04: the event's categories as a grid, categories down and round positions
 * across. Each row keeps the category's details and actions; round cells open the round form
 * in a dialog for event managers, read-only for everyone else.
 */
const props = defineProps<{
  eventId: string
  categories: CategoryRecord[] | undefined
  loading?: boolean
  /** Event managers and admins change rounds and categories. */
  editable: boolean
  /** Show the rounds & ranking link (event staff and admins). */
  showRanking?: boolean
  /** Admins save categories to the library. */
  canSaveTemplate?: boolean
}>()
const emit = defineEmits<{
  edit: [category: CategoryRecord]
  saveAsTemplate: [category: CategoryRecord]
  delete: [category: CategoryRecord]
}>()

const rounds = ref<RoundRecord[]>([])
const phases = ref<ScoringPhase[]>([])
const gameRules = ref<GameRuleRecord[]>([])
const rulesets = ref<RulesetState[]>([])
const days = ref<CompetitionDayRecord[]>([])
const loaded = ref(false)
const error = ref<AppError>()

async function loadAll() {
  try {
    const [r, p, g, s, d] = await Promise.all([
      listEventRounds(props.eventId),
      listEventScoringPhases(props.eventId),
      listEventGameRules(props.eventId),
      listEventRulesetStates(props.eventId),
      listEventDays(props.eventId),
    ])
    rounds.value = r
    phases.value = p
    gameRules.value = g
    rulesets.value = s
    days.value = d
    error.value = undefined
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loaded.value = true
  }
}

/** After a round changes: its rounds and their scoring phases. */
async function loadRounds() {
  try {
    const [r, p] = await Promise.all([
      listEventRounds(props.eventId),
      listEventScoringPhases(props.eventId),
    ])
    rounds.value = r
    phases.value = p
  } catch (e) {
    error.value = toAppError(e)
  }
}

// New, edited or deleted categories (and their rulesets) show at once.
watch(() => [props.eventId, props.categories], loadAll, { immediate: true })

const grid = computed(() =>
  buildGrid({
    categories: props.categories ?? [],
    rounds: rounds.value,
    phases: phases.value,
    gameRules: gameRules.value,
    rulesets: rulesets.value,
    days: days.value,
  }),
)
/** Round columns, plus one for "+ Round" in the fullest row. */
const roundColumns = computed(() => grid.value.columns + (props.editable ? 1 : 0))

const range = (min: number, max: number) =>
  min && max ? `${min}–${max}` : min ? `≥ ${min}` : max ? `≤ ${max}` : t('categories.any')

function rulesText(row: GridRow) {
  if (row.rulesState === 'none') return t('categories.grid.rules.none')
  if (row.rulesState === 'draft') return t('categories.grid.rules.draft')
  return ''
}

function checkText(cell: GridCell) {
  return cell.checkMode ? t(`categories.grid.check.${cell.checkMode}`) : ''
}

const from = computed(() => `/events/${props.eventId}?tab=categories`)

// --- Phone width (< 768 px): one card per category --------------------------------------

const narrow = useMediaQuery('(max-width: 767px)')

// --- Keyboard (M11-04): one tab stop, arrow keys between cells ------------------------------

/** Row header actions, each a cell of the row's first columns. */
const actions = computed(() => {
  const list: ('ranking' | 'rules' | 'edit' | 'more')[] = []
  if (props.showRanking) list.push('ranking')
  list.push('rules')
  if (props.editable) list.push('edit', 'more')
  return list
})
const width = computed(() => actions.value.length + roundColumns.value)
const table = ref<HTMLElement>()
const focused = ref<[number, number]>([0, 0])

function tabindex(row: number, col: number) {
  return focused.value[0] === row && focused.value[1] === col ? 0 : -1
}

function pos(row: number, col: number) {
  return `${row}:${col}`
}

function focusCell(row: number, col: number) {
  focused.value = [row, col]
  void nextTick(() =>
    table.value?.querySelector<HTMLElement>(`[data-pos="${pos(row, col)}"]`)?.focus(),
  )
}

function onFocusin(event: FocusEvent) {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-pos]')
  if (!cell?.dataset.pos) return
  const [row, col] = cell.dataset.pos.split(':').map(Number)
  focused.value = [row!, col!]
}

// Captured, so a menu trigger does not open on an arrow key meant for the grid.
function onKeydown(event: KeyboardEvent) {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-pos]')
  if (!cell?.dataset.pos) return
  let [row, col] = cell.dataset.pos.split(':').map(Number) as [number, number]
  const last = grid.value.rows.length - 1
  switch (event.key) {
    case 'ArrowRight':
      col++
      break
    case 'ArrowLeft':
      col--
      break
    case 'ArrowDown':
      row++
      break
    case 'ArrowUp':
      row--
      break
    case 'Home':
      col = 0
      if (event.ctrlKey) row = 0
      break
    case 'End':
      col = width.value - 1
      if (event.ctrlKey) row = last
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
  focusCell(Math.min(Math.max(row, 0), last), Math.min(Math.max(col, 0), width.value - 1))
}

// Keep the tab stop inside the grid when rows or columns go away.
watch([() => grid.value.rows.length, width], ([rows, cols]) => {
  const [row, col] = focused.value
  if (row >= rows || col >= cols) focused.value = [Math.max(0, rows - 1), Math.max(0, cols - 1)]
})

// --- Round dialog (M11-02) -------------------------------------------------------------

const dialog = ref<{ row: GridRow; round?: RoundRecord }>()
const dialogOpen = computed({
  get: () => !!dialog.value,
  set: (open: boolean) => {
    if (!open) dialog.value = undefined
  },
})

function openRound(row: GridRow, round?: RoundRecord) {
  if (!props.editable) return
  dialog.value = { row, round }
}

/** Saved, but its start time was not (M11-05): the dialog stays open on the round. */
async function onRoundKept(round: RoundRecord) {
  if (dialog.value) dialog.value = { ...dialog.value, round }
  await loadRounds()
}

async function onRoundChanged() {
  dialog.value = undefined
  await loadRounds()
}

defineExpose({ reload: loadAll })
</script>

<template>
  <div class="flex flex-col gap-2">
    <ErrorAlert :error="error" />
    <Skeleton v-if="(loading && !categories) || (!loaded && categories?.length)" class="h-40" />
    <p
      v-else-if="!categories?.length"
      class="py-8 text-center text-sm text-muted-foreground"
      data-testid="categories-empty"
    >
      {{ t('categories.empty') }}
    </p>

    <!-- Phone width: one card per category. -->
    <ul v-else-if="narrow" class="flex flex-col gap-3" data-testid="category-cards">
      <li
        v-for="row in grid.rows"
        :key="row.category.id"
        class="rounded-lg border p-3"
        :data-category="row.category.code"
      >
        <p class="font-medium">
          <span class="font-mono">{{ row.category.code }}</span> {{ row.category.name }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ t('categories.teamSize') }}
          {{ range(row.category.min_team_size, row.category.max_team_size) }} ·
          {{ t('categories.age') }} {{ range(row.category.min_age, row.category.max_age) }} ·
          {{ t('categories.maxTeams') }} {{ row.category.max_teams || '∞' }}
        </p>
        <ol class="mt-2 flex flex-col gap-1">
          <li v-for="cell in row.cells" :key="cell.round.id">
            <component
              :is="editable ? 'button' : 'div'"
              :type="editable ? 'button' : undefined"
              class="flex w-full flex-wrap items-baseline gap-x-2 rounded-md border px-2 py-1.5 text-left text-sm"
              :class="[
                editable && 'hover:bg-accent',
                cell.rulesState !== 'published' && 'border-dashed border-amber-600',
              ]"
              :aria-label="cellLabel(row.category, cell)"
              data-testid="round-cell"
              @click="openRound(row, cell.round)"
            >
              <span class="font-mono">{{ cell.round.key }}</span>
              <span>{{ cell.round.name }}</span>
              <span class="text-muted-foreground">
                {{ dayName(cell.day, 'short') }} {{ cell.startsAt || '–' }}
              </span>
              <TriangleAlertIcon
                v-if="cell.rulesState !== 'published'"
                class="size-4 text-amber-700 dark:text-amber-400"
                aria-hidden="true"
              />
            </component>
          </li>
        </ol>
        <div class="mt-2 flex flex-wrap gap-2">
          <Button v-if="editable" size="sm" variant="outline" @click="openRound(row)">
            <PlusIcon /> {{ t('categories.grid.addRound') }}
          </Button>
          <Button v-if="showRanking" as-child variant="outline" size="sm">
            <RouterLink
              :to="{ name: 'category-ranking', params: { id: row.category.id }, query: { from } }"
              :aria-label="t('categories.rankingFor', { code: row.category.code })"
              ><TrophyIcon /> {{ t('categories.ranking') }}</RouterLink
            >
          </Button>
          <Button as-child variant="outline" size="sm">
            <RouterLink
              :to="{ name: 'category-scoring', params: { id: row.category.id }, query: { from } }"
              data-testid="rules-link"
              :data-rules="row.rulesState"
            >
              <TriangleAlertIcon v-if="row.rulesState !== 'published'" />
              <CalculatorIcon v-else />
              {{ t('categories.rules') }}
              <span v-if="rulesText(row)" class="text-amber-700 dark:text-amber-400">
                · {{ rulesText(row) }}</span
              >
            </RouterLink>
          </Button>
          <template v-if="editable">
            <Button size="sm" variant="ghost" @click="emit('edit', row.category)">
              <PencilIcon /> {{ t('common.edit') }}
            </Button>
            <Button
              v-if="canSaveTemplate"
              size="sm"
              variant="ghost"
              @click="emit('saveAsTemplate', row.category)"
            >
              <CopyIcon /> {{ t('categories.saveAsTemplate') }}
            </Button>
            <Button size="sm" variant="ghost" @click="emit('delete', row.category)">
              <Trash2Icon /> {{ t('common.delete') }}
            </Button>
          </template>
        </div>
      </li>
    </ul>

    <!-- The grid: categories down, round positions across. -->
    <div v-else class="overflow-x-auto rounded-md border">
      <table
        ref="table"
        role="grid"
        class="w-full border-collapse text-sm"
        :aria-label="t('categories.grid.label')"
        data-testid="category-grid"
        @keydown.capture="onKeydown"
        @focusin="onFocusin"
      >
        <thead>
          <tr class="border-b bg-muted/50">
            <th scope="col" class="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium">
              {{ t('events.tabs.categories') }}
            </th>
            <th
              v-for="n in grid.columns"
              :key="n"
              scope="col"
              class="min-w-40 px-2 py-2 text-left font-medium"
            >
              {{ t('categories.grid.roundHeader', { n }) }}
            </th>
            <th v-if="editable" scope="col" class="min-w-32 px-2 py-2">
              <span class="sr-only">{{ t('categories.grid.addRound') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, r) in grid.rows"
            :key="row.category.id"
            class="border-b last:border-b-0"
            :data-category="row.category.code"
          >
            <th
              scope="row"
              class="sticky left-0 z-10 border-r bg-background px-3 py-2 text-left align-top font-normal"
            >
              <p class="font-medium whitespace-nowrap">
                <span class="font-mono">{{ row.category.code }}</span>
                {{ row.category.name }}
              </p>
              <p class="text-xs whitespace-nowrap text-muted-foreground">
                <span :title="t('categories.teamSize')"
                  ><span class="sr-only">{{ t('categories.teamSize') }} </span
                  >{{ range(row.category.min_team_size, row.category.max_team_size) }}</span
                >
                ·
                <span :title="t('categories.age')"
                  ><span class="sr-only">{{ t('categories.age') }} </span
                  >{{ range(row.category.min_age, row.category.max_age) }}</span
                >
                ·
                <span :title="t('categories.maxTeams')"
                  ><span class="sr-only">{{ t('categories.maxTeams') }} </span
                  >{{ row.category.max_teams || '∞' }}</span
                >
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-1">
                <template v-for="(action, a) in actions" :key="action">
                  <!-- Labelled, not icon-only: under time pressure nobody should guess. -->
                  <Button v-if="action === 'ranking'" as-child variant="outline" size="sm">
                    <RouterLink
                      :to="{
                        name: 'category-ranking',
                        params: { id: row.category.id },
                        query: { from },
                      }"
                      :aria-label="t('categories.rankingFor', { code: row.category.code })"
                      :data-pos="pos(r, a)"
                      :tabindex="tabindex(r, a)"
                    >
                      <TrophyIcon /> {{ t('categories.ranking') }}
                    </RouterLink>
                  </Button>
                  <Button
                    v-else-if="action === 'rules'"
                    as-child
                    :variant="row.rulesState === 'published' ? 'ghost' : 'outline'"
                    size="sm"
                    :class="
                      row.rulesState !== 'published' &&
                      'border-amber-600 text-amber-800 dark:text-amber-300'
                    "
                  >
                    <RouterLink
                      :to="{
                        name: 'category-scoring',
                        params: { id: row.category.id },
                        query: { from },
                      }"
                      :aria-label="
                        rulesText(row)
                          ? `${t('categories.rulesFor', { code: row.category.code })}: ${rulesText(row)}`
                          : t('categories.rulesFor', { code: row.category.code })
                      "
                      :data-pos="pos(r, a)"
                      :tabindex="tabindex(r, a)"
                      data-testid="rules-link"
                      :data-rules="row.rulesState"
                    >
                      <TriangleAlertIcon v-if="row.rulesState !== 'published'" />
                      <CalculatorIcon v-else />
                      {{ t('categories.rules') }}
                      <span v-if="rulesText(row)">· {{ rulesText(row) }}</span>
                    </RouterLink>
                  </Button>
                  <Button
                    v-else-if="action === 'edit'"
                    variant="ghost"
                    size="sm"
                    :aria-label="t('common.editItem', { item: row.category.code })"
                    :data-pos="pos(r, a)"
                    :tabindex="tabindex(r, a)"
                    @click="emit('edit', row.category)"
                  >
                    <PencilIcon /> {{ t('common.edit') }}
                  </Button>
                  <DropdownMenu v-else>
                    <DropdownMenuTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        :aria-label="t('categories.grid.moreActions', { code: row.category.code })"
                        :data-pos="pos(r, a)"
                        :tabindex="tabindex(r, a)"
                      >
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        v-if="canSaveTemplate"
                        @select="emit('saveAsTemplate', row.category)"
                      >
                        <CopyIcon /> {{ t('categories.saveAsTemplate') }}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        @select="emit('delete', row.category)"
                      >
                        <Trash2Icon /> {{ t('common.delete') }}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </template>
              </div>
            </th>
            <td
              v-for="c in roundColumns"
              :key="c"
              class="p-1 align-top"
              :data-col="c"
              v-bind="
                !row.cells[c - 1] && !(editable && c - 1 === row.cells.length)
                  ? {
                      'data-pos': pos(r, actions.length + c - 1),
                      tabindex: tabindex(r, actions.length + c - 1),
                      'aria-label': t('categories.grid.emptyCell', {
                        code: row.category.code,
                        n: c,
                      }),
                    }
                  : {}
              "
            >
              <template v-if="row.cells[c - 1]">
                <component
                  :is="editable ? 'button' : 'div'"
                  :type="editable ? 'button' : undefined"
                  class="flex h-full w-full flex-col items-start rounded-md border px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  :class="[
                    editable && 'hover:bg-accent',
                    row.cells[c - 1]!.rulesState !== 'published' &&
                      'border-dashed border-amber-600',
                  ]"
                  :aria-label="cellLabel(row.category, row.cells[c - 1]!)"
                  :data-pos="pos(r, actions.length + c - 1)"
                  :tabindex="tabindex(r, actions.length + c - 1)"
                  data-testid="round-cell"
                  :data-round="row.cells[c - 1]!.round.key"
                  @click="openRound(row, row.cells[c - 1]!.round)"
                >
                  <span class="font-medium">
                    <span class="font-mono">{{ row.cells[c - 1]!.round.key }}</span>
                    {{ row.cells[c - 1]!.round.name }}
                  </span>
                  <span
                    v-if="
                      row.cells[c - 1]!.showGame || row.cells[c - 1]!.rulesState !== 'published'
                    "
                    class="flex items-center gap-1 text-xs"
                  >
                    <span v-if="row.cells[c - 1]!.showGame">{{
                      row.cells[c - 1]!.game?.name ?? t('rankings.rounds.notSet')
                    }}</span>
                    <span
                      v-if="row.cells[c - 1]!.rulesState !== 'published'"
                      class="flex items-center gap-1 text-amber-800 dark:text-amber-300"
                      data-testid="cell-no-ruleset"
                    >
                      <TriangleAlertIcon class="size-3.5" aria-hidden="true" />
                      {{ t('categories.grid.noRuleset') }}
                    </span>
                  </span>
                  <span class="text-xs text-muted-foreground" data-testid="cell-time">
                    {{ dayName(row.cells[c - 1]!.day, 'short') }}
                    {{ row.cells[c - 1]!.startsAt || '–' }}
                  </span>
                  <span v-if="row.cells[c - 1]!.checkMode" class="text-xs text-muted-foreground">
                    {{ checkText(row.cells[c - 1]!) }}
                  </span>
                </component>
              </template>
              <Button
                v-else-if="editable && c - 1 === row.cells.length"
                variant="ghost"
                size="sm"
                class="w-full justify-start text-muted-foreground"
                :aria-label="t('categories.grid.addRoundTo', { code: row.category.code })"
                :data-pos="pos(r, actions.length + c - 1)"
                :tabindex="tabindex(r, actions.length + c - 1)"
                data-testid="add-round"
                @click="openRound(row)"
              >
                <PlusIcon /> {{ t('categories.grid.addRound') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="grid.rows.length && !narrow" class="text-xs text-muted-foreground">
      <TriangleAlertIcon class="inline size-3.5" aria-hidden="true" />
      {{ t('categories.grid.legendRuleset') }} · – {{ t('categories.grid.legendTime') }}
    </p>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{
            dialog?.round
              ? t('categories.grid.editTitle', {
                  round: `${dialog.round.key} ${dialog.round.name}`,
                  code: dialog.row.category.code,
                })
              : t('categories.grid.newTitle', { code: dialog?.row.category.code ?? '' })
          }}</DialogTitle>
          <DialogDescription>{{ t('categories.grid.dialogDescription') }}</DialogDescription>
        </DialogHeader>
        <RoundForm
          v-if="dialog"
          :category-id="dialog.row.category.id"
          :rounds="dialog.row.rounds"
          :round="dialog.round"
          :days="days"
          :game-rules="dialog.row.gameRules"
          :event-id="eventId"
          cancelable
          deletable
          @saved="onRoundChanged"
          @changed="onRoundKept"
          @deleted="onRoundChanged"
          @cancel="dialog = undefined"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
