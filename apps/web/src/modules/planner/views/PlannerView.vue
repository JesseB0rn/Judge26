<script setup lang="ts">
import { t } from '@/i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useMediaQuery } from '@vueuse/core'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CalendarDaysIcon,
  ColumnsIcon,
  PlusIcon,
  PrinterIcon,
  SettingsIcon,
  Undo2Icon,
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { formatDay } from '@/shared/format'
import { getEvent } from '@/modules/events/api'
import { localDate } from '@/modules/live/lib'
import LiveIndicator from '@/modules/live/components/LiveIndicator.vue'
import { useLiveUpdates } from '@/modules/live/useLiveUpdates'
import type { EventRecord } from '@/shared/types/records'
import { getPlanner, isConflict, updateBlock, updatePhase } from '../api'
import {
  dayOffset,
  findItem,
  gridColumns,
  laterPhases,
  parseRef,
  PHASE_SHORT,
  refKey,
  shiftPlacement,
  sortedDays,
  todayId,
  toMinutes,
  issueText,
} from '../lib'
import type {
  CreateRequest,
  ItemRef,
  MoveRequest,
  PlannerBlock,
  PlannerData,
  PlannerPhase,
} from '../types'
import PlannerBoard from '../components/PlannerBoard.vue'
import BlockDialog from '../components/BlockDialog.vue'
import PhaseDialog from '../components/PhaseDialog.vue'
import ColumnsDialog from '../components/ColumnsDialog.vue'

/** Schedule planner of an event (M4-14): editor for managers, read-only for everyone else. */
const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()

const event = ref<EventRecord>()
const data = ref<PlannerData>()
const loadError = ref<AppError | null>(null)
const loading = ref(false)
const board = ref<InstanceType<typeof PlannerBoard>>()

async function load() {
  loading.value = true
  try {
    const [e, d] = await Promise.all([
      event.value?.id === props.id ? event.value : getEvent(props.id),
      getPlanner(props.id),
    ])
    event.value = e
    data.value = d
    loadError.value = null
  } catch (error) {
    loadError.value = toAppError(error)
  } finally {
    loading.value = false
  }
}

const live = useLiveUpdates(() => props.id, load)

// Editing needs a tablet or desktop; phones show the read-only schedule.
const narrow = useMediaQuery('(max-width: 639px)')
const editable = computed(() => !!data.value?.can_edit && !narrow.value)
const days = computed(() => sortedDays(data.value?.days ?? []))

// --- Filters (M4-14-28): visible columns and days live in the URL ----------------

function idList(value: unknown): string[] | null {
  return typeof value === 'string' ? value.split(',').filter(Boolean) : null
}
// Categories, then custom columns (M4-14-33).
const allColumns = computed(() => (data.value ? gridColumns(data.value) : []))
const shownColumns = computed(() => {
  const d = data.value
  if (!d) return []
  return gridColumns(d, idList(route.query.cols) ?? [])
})
const shownDays = computed(() => {
  const chosen = idList(route.query.days)
  const visible = chosen ? days.value.filter((d) => chosen.includes(d.id)) : []
  return visible.length ? visible : days.value
})

function toggle(key: 'cols' | 'days', all: string[], shown: string[], id: string, on: boolean) {
  const next = on ? all.filter((x) => x === id || shown.includes(x)) : shown.filter((x) => x !== id)
  if (!next.length) return
  const query = { ...route.query }
  if (next.length === all.length && (key === 'days' || data.value?.internal)) delete query[key]
  else query[key] = next.join(',')
  void router.replace({ query })
}
const toggleColumn = (id: string, on: boolean) =>
  toggle(
    'cols',
    allColumns.value.map((c) => c.id),
    shownColumns.value.map((c) => c.id),
    id,
    on,
  )
const columnsOpen = ref(false)
const toggleDay = (id: string, on: boolean) =>
  toggle(
    'days',
    days.value.map((d) => d.id),
    shownDays.value.map((d) => d.id),
    id,
    on,
  )

const moveLater = ref(false)

// --- Deep links (M4-14-16): ?item=phase:<id> | block:<id> ----------------------------

const selected = computed(() => parseRef(route.query.item))
const blockOpen = ref(false)
const phaseOpen = ref(false)
const draft = ref<Partial<PlannerBlock> & Pick<PlannerBlock, 'day' | 'starts_at'>>()

function openItem(ref: ItemRef) {
  void router.replace({ query: { ...route.query, item: refKey(ref) } })
}

function closeItem() {
  if (!route.query.item) return
  const query = { ...route.query }
  delete query.item
  void router.replace({ query })
}

const openBlock = computed(() => {
  const ref = selected.value
  return ref?.kind === 'block' && data.value
    ? (data.value.blocks.find((b) => b.id === ref.id) ?? null)
    : null
})
const openPhase = computed(() => {
  const ref = selected.value
  return ref?.kind === 'phase' && data.value
    ? (data.value.phases.find((p) => p.id === ref.id) ?? null)
    : null
})
const openRound = computed(() =>
  openPhase.value ? data.value?.rounds.find((r) => r.id === openPhase.value!.round) : undefined,
)

let scrolledTo = ''
watch(
  [selected, data],
  async ([ref, d]) => {
    if (!d) return
    if (!ref) {
      // A new block being created has no deep link yet.
      if (draft.value) return
      blockOpen.value = false
      phaseOpen.value = false
      return
    }
    if (!findItem(d, ref)) {
      toast.error(t('planner.view.linkGone'))
      closeItem()
      return
    }
    draft.value = undefined
    if (ref.kind === 'block') blockOpen.value = true
    else phaseOpen.value = true
    if (scrolledTo !== refKey(ref)) {
      scrolledTo = refKey(ref)
      await nextTick()
      board.value?.scrollToItem(ref)
    }
  },
  { immediate: true },
)
watch([blockOpen, phaseOpen], ([b, p]) => {
  if (!b && !p) {
    scrolledTo = ''
    draft.value = undefined
    closeItem()
  }
})

const dialogBlock = computed(() => draft.value ?? openBlock.value)

function newBlock(request?: CreateRequest) {
  const firstDay = shownDays.value[0]
  if (!request && !firstDay) return
  closeItem()
  draft.value = request
    ? {
        day: request.day,
        starts_at: request.starts_at,
        duration_minutes: request.duration_minutes,
        categories: request.column && !request.custom ? [request.column] : [],
        columns: request.column && request.custom ? [request.column] : [],
      }
    : {
        day: firstDay!.id,
        starts_at: firstDay!.starts_at,
        duration_minutes: 30,
        categories: [],
        columns: [],
      }
  blockOpen.value = true
}

// --- Changes: optimistic, versioned, undoable (M4-14-19, M4-14-32) -----------------

type Change =
  | {
      ref: { kind: 'phase'; id: string }
      data: Partial<Pick<PlannerPhase, 'day' | 'starts_at' | 'duration_minutes'>>
    }
  | {
      ref: { kind: 'block'; id: string }
      data: Partial<
        Pick<PlannerBlock, 'day' | 'starts_at' | 'duration_minutes' | 'categories' | 'columns'>
      >
    }

const undoStack = ref<Change[][]>([])
const saving = ref(false)

function snapshotOf(change: Change): Change {
  const record = data.value && findItem(data.value, change.ref)
  const before: Record<string, unknown> = {}
  for (const key of Object.keys(change.data)) {
    const value = (record as unknown as Record<string, unknown> | undefined)?.[key]
    before[key] = Array.isArray(value) ? [...value] : value
  }
  return { ref: change.ref, data: before } as Change
}

async function apply(changes: Change[], options: { undoable?: boolean } = {}) {
  if (!data.value || !changes.length) return
  const before = changes.map(snapshotOf)
  // Optimistic: show the result right away.
  for (const change of changes) {
    const record = findItem(data.value, change.ref)
    if (record) Object.assign(record, change.data)
  }
  saving.value = true
  try {
    for (const change of changes) {
      const record = findItem(data.value, change.ref)
      if (!record) continue
      const saved =
        change.ref.kind === 'phase'
          ? await updatePhase(record as PlannerPhase, change.data)
          : await updateBlock(record as PlannerBlock, change.data)
      record.updated = saved.updated
    }
    if (options.undoable !== false) {
      undoStack.value = [...undoStack.value.slice(-19), before]
    }
  } catch (error) {
    if (isConflict(error)) {
      toast.error(t('planner.view.conflict'))
    } else {
      toast.error(toAppError(error).message)
    }
  } finally {
    saving.value = false
    await load()
  }
}

function onMove(request: MoveRequest) {
  if (!data.value) return
  const record = findItem(data.value, request.ref)
  if (!record) return
  const changes: Change[] = []
  if (request.ref.kind === 'phase') {
    const phase = record as PlannerPhase
    changes.push({ ref: { kind: 'phase', id: phase.id }, data: { ...request.placement } })
    if (request.later && phase.day && toMinutes(phase.starts_at) !== null) {
      // Later phases keep their gaps: same day offset and minute delta.
      const offset = dayOffset(days.value, phase.day, request.placement.day)
      const minutes = toMinutes(request.placement.starts_at)! - toMinutes(phase.starts_at)!
      for (const later of laterPhases(data.value.phases, phase)) {
        const placement = shiftPlacement(
          days.value,
          { day: later.day, starts_at: later.starts_at },
          later.duration_minutes,
          offset,
          minutes,
        )
        if (placement) changes.push({ ref: { kind: 'phase', id: later.id }, data: placement })
      }
    }
  } else {
    changes.push({
      ref: { kind: 'block', id: record.id },
      data: {
        ...request.placement,
        ...request.coverage,
      },
    })
  }
  void apply(changes)
}

function onResize(ref: ItemRef, duration: number) {
  void apply([{ ref, data: { duration_minutes: duration } } as Change])
}

async function undo() {
  const last = undoStack.value[undoStack.value.length - 1]
  if (!last || saving.value) return
  undoStack.value = undoStack.value.slice(0, -1)
  await apply(last, { undoable: false })
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [role="dialog"]')) return
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && editable.value) {
    e.preventDefault()
    void undo()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function onConflict() {
  toast.error(t('planner.view.conflict'))
  void load()
}

// --- Issues ------------------------------------------------------------------------

const issueList = computed(() => {
  const d = data.value
  if (!d) return []
  return d.issues.map((issue, index) => {
    const names = issue.items.map((item) => {
      if (item.kind === 'block') return d.blocks.find((b) => b.id === item.id)?.title ?? 'Block'
      const phase = d.phases.find((p) => p.id === item.id)
      const round = phase && d.rounds.find((r) => r.id === phase.round)
      return round && phase ? `${round.key} ${PHASE_SHORT[phase.phase]}` : 'Phase'
    })
    return { key: `${issue.code}-${index}`, issue, names }
  })
})

// --- Initial position ----------------------------------------------------------------

let positioned = false
watch(data, async (d) => {
  if (!d || positioned) return
  positioned = true
  if (selected.value) return
  await nextTick()
  const today = todayId(shownDays.value, localDate(new Date()))
  const first = today ?? shownDays.value[0]?.id
  if (first) board.value?.scrollToDay(first)
})

watch(
  () => props.id,
  () => {
    positioned = false
    void load()
  },
  { immediate: true },
)

function print() {
  window.print()
}

const backLink = computed(() => ({ name: 'event', params: { id: props.id } }))
</script>

<template>
  <ErrorAlert v-if="!data" :error="loadError" />
  <Skeleton v-if="!data && loading" class="h-10 w-1/2" />
  <template v-if="data && event">
    <!-- Printed pages are titled with the event (M4-14-31). -->
    <div class="mb-4 hidden print:block" data-testid="planner-print-title">
      <h1 class="text-2xl font-semibold tracking-tight">{{ event.name }}</h1>
      <p v-if="event.venue" class="text-muted-foreground">{{ event.venue }}</p>
    </div>
    <PageHeader
      class="print:hidden"
      :title="data.can_edit ? t('planner.view.title') : t('events.tabs.schedule')"
      :description="`${event.name}${event.venue ? ' · ' + event.venue : ''}`"
    >
      <template #actions>
        <LiveIndicator
          class="self-center print:hidden"
          :status="live.status.value"
          :stale="false"
        />
        <Button as-child variant="outline" class="print:hidden">
          <RouterLink :to="backLink"><ArrowLeftIcon /> {{ t('events.event') }}</RouterLink>
        </Button>
        <Button variant="outline" class="print:hidden" @click="print">
          <PrinterIcon /> {{ t('planner.view.print') }}
        </Button>
        <Button v-if="editable" class="print:hidden" :disabled="!days.length" @click="newBlock()">
          <PlusIcon /> {{ t('planner.block.new') }}
        </Button>
      </template>
    </PageHeader>

    <ErrorAlert :error="loadError" class="mb-3" />

    <div class="mb-3 flex flex-wrap items-center gap-2 print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            <ColumnsIcon /> {{ t('planner.block.columns') }}
            <Badge variant="secondary">{{ shownColumns.length }}/{{ allColumns.length }}</Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{{ t('planner.view.shownColumns') }}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <template v-for="(c, i) in allColumns" :key="c.id">
            <DropdownMenuSeparator v-if="c.custom && !allColumns[i - 1]?.custom" />
            <DropdownMenuCheckboxItem
              :class="{ italic: c.custom }"
              :model-value="shownColumns.some((s) => s.id === c.id)"
              @update:model-value="toggleColumn(c.id, !!$event)"
              @select.prevent
              >{{ c.name }}</DropdownMenuCheckboxItem
            >
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu v-if="days.length > 1">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            <CalendarDaysIcon /> {{ t('planner.view.days') }}
            <Badge variant="secondary">{{ shownDays.length }}/{{ days.length }}</Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{{ t('planner.view.shownDays') }}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            v-for="d in days"
            :key="d.id"
            :model-value="shownDays.some((s) => s.id === d.id)"
            @update:model-value="toggleDay(d.id, !!$event)"
            @select.prevent
            >{{
              d.label ? `${d.label} · ${formatDay(d.date)}` : formatDay(d.date)
            }}</DropdownMenuCheckboxItem
          >
        </DropdownMenuContent>
      </DropdownMenu>
      <Button v-if="editable" variant="outline" size="sm" @click="columnsOpen = true">
        <SettingsIcon /> {{ t('planner.columns.title') }}
      </Button>
      <template v-if="editable">
        <label class="ml-1 flex items-center gap-2 text-sm">
          <input v-model="moveLater" type="checkbox" class="size-4 accent-primary" />
          {{ t('planner.view.moveLater') }}
          <span class="text-xs text-muted-foreground">{{ t('planner.view.moveLaterHint') }}</span>
        </label>
        <Button
          variant="ghost"
          size="sm"
          class="ml-auto"
          :disabled="!undoStack.length || saving"
          :title="t('planner.view.undoTitle')"
          @click="undo"
        >
          <Undo2Icon /> {{ t('diagram.undo') }}
        </Button>
      </template>
    </div>

    <details
      v-if="data.internal && issueList.length"
      class="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm print:hidden"
      data-testid="planner-issues"
    >
      <summary class="flex cursor-pointer items-center gap-2 font-medium">
        <AlertTriangleIcon class="size-4 text-destructive" />
        {{ t('planner.view.warnings', issueList.length) }}
      </summary>
      <ul class="mt-2 flex flex-col gap-1">
        <li v-for="entry in issueList" :key="entry.key" class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="font-medium underline-offset-2 hover:underline"
            @click="openItem(entry.issue.items[0]!)"
          >
            {{ entry.names.join(' / ') }}
          </button>
          <span class="text-muted-foreground">{{ issueText(entry.issue) }}</span>
        </li>
      </ul>
    </details>

    <p
      v-if="data.can_edit && narrow"
      class="mb-2 text-xs text-muted-foreground print:hidden"
      data-testid="planner-narrow"
    >
      {{ t('planner.view.narrow') }}
    </p>
    <p v-if="editable" class="mb-2 text-xs text-muted-foreground print:hidden">
      {{ t('planner.view.help') }}
    </p>

    <PlannerBoard
      ref="board"
      :data="data"
      :days="shownDays"
      :columns="shownColumns"
      :editable="editable"
      :selected="selected ? refKey(selected) : ''"
      :move-later="moveLater"
      @open="openItem"
      @move="onMove"
      @resize="onResize"
      @create="newBlock"
    />

    <BlockDialog
      v-model:open="blockOpen"
      :event-id="props.id"
      :block="dialogBlock ?? null"
      :days="days"
      :categories="data.categories"
      :custom-columns="data.columns ?? []"
      :editable="editable"
      :internal="data.internal"
      @saved="load"
      @deleted="load"
      @conflict="onConflict"
    />
    <ColumnsDialog
      v-model:open="columnsOpen"
      :event-id="props.id"
      :columns="data.columns ?? []"
      @changed="load"
    />
    <PhaseDialog
      v-model:open="phaseOpen"
      :phase="openPhase"
      :round="openRound"
      :category="data.categories.find((c) => c.id === openRound?.category)"
      :siblings="data.phases.filter((p) => p.round === openPhase?.round)"
      :days="days"
      :editable="editable"
      @changed="load"
      @conflict="onConflict"
    />
  </template>
</template>
