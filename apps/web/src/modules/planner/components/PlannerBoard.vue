<script setup lang="ts">
import { t } from '@/i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangleIcon, EyeOffIcon, GripVerticalIcon } from '@lucide/vue'
import { formatDay } from '@/shared/format'
import { localDate } from '@/modules/live/lib'
import {
  axisRange,
  blockClasses,
  coverageCount,
  clamp,
  clampStart,
  DAY_MINUTES,
  dayName,
  formatTime,
  issuesByItem,
  layoutDay,
  MIN_DRAG_MINUTES,
  PHASE_CLASSES,
  PHASE_LABELS,
  PHASE_SHORT,
  placedRanges,
  refKey,
  snap,
  SNAP_MINUTES,
  timeRange,
  toMinutes,
  unplacedPhases,
  type LayoutItem,
  issueText,
} from '../lib'
import type {
  CreateRequest,
  ItemRef,
  MoveRequest,
  PlannerBlock,
  GridColumn,
  PlannerData,
  PlannerDay,
  PlannerPhase,
} from '../types'

/**
 * The planner grid (M4-14-05): all days next to one another, one column per category, rows are
 * time of day. Editors move blocks by drag (or keyboard), resize them at the lower edge, create
 * blocks on empty space and place phases from the tray. The parent stores the changes.
 */
const props = withDefaults(
  defineProps<{
    data: PlannerData
    days: PlannerDay[]
    /** Categories, then custom columns (M4-14-33). */
    columns: GridColumn[]
    editable?: boolean
    /** Key of the selected item ("phase:<id>"). */
    selected?: string
    /** Moving a phase also moves the round's later phases (M4-14-11). */
    moveLater?: boolean
    /** Pixels per minute on screen. */
    scale?: number
    /** Limit the height of the scroll area (off for TV and print). */
    contained?: boolean
  }>(),
  { editable: false, selected: '', moveLater: false, scale: 1.6, contained: true },
)

const emit = defineEmits<{
  open: [ref: ItemRef]
  move: [request: MoveRequest]
  resize: [ref: ItemRef, duration: number]
  create: [request: CreateRequest]
}>()

const COL_W = 168
const AXIS_W = 56
const HEADER_H = 60

const rounds = computed(() => new Map(props.data.rounds.map((r) => [r.id, r])))
const phases = computed(() => new Map(props.data.phases.map((p) => [p.id, p])))
const blocks = computed(() => new Map(props.data.blocks.map((b) => [b.id, b])))
const columnIds = computed(() => props.columns.map((c) => c.id))
const issues = computed(() => issuesByItem(props.data.issues))
const axis = computed(() => axisRange(props.days, placedRanges(props.data)))
const hours = computed(() => {
  const list: number[] = []
  for (let m = axis.value.start; m <= axis.value.end; m += 60) list.push(m)
  return list
})
const layouts = computed(() => {
  const map: Record<string, LayoutItem[]> = {}
  for (const day of props.days) map[day.id] = layoutDay(day.id, columnIds.value, props.data)
  return map
})
const tray = computed(() => (props.editable ? unplacedPhases(props.data) : []))

// Print: one day per A4 landscape page (M4-14-31).
const printVars = computed(() => {
  const minutes = axis.value.end - axis.value.start
  return {
    '--ppm': `${props.scale}px`,
    '--col': `${COL_W}px`,
    '--ppm-print': `${Math.min(props.scale, 520 / minutes)}px`,
    '--col-print': `${Math.min(COL_W, 960 / Math.max(1, props.columns.length))}px`,
  }
})

const y = (minutes: number) => `calc(${minutes - axis.value.start} * var(--ppm))`
const h = (minutes: number) => `calc(${minutes} * var(--ppm))`

function itemStyle(item: { col: number; span: number; lane: number; lanes: number }) {
  const left = item.col + item.lane / item.lanes
  const width = item.span / item.lanes
  return { left: `calc(var(--col) * ${left} + 2px)`, width: `calc(var(--col) * ${width} - 4px)` }
}

// --- Item details -------------------------------------------------------------

interface ItemView {
  title: string
  subtitle: string
  time: string
  classes: string
  round?: string
  internal?: boolean
}

function view(ref: ItemRef): ItemView | null {
  if (ref.kind === 'phase') {
    const phase = phases.value.get(ref.id)
    const round = phase && rounds.value.get(phase.round)
    if (!phase || !round) return null
    return {
      title: `${round.key} · ${PHASE_SHORT[phase.phase]}`,
      subtitle: round.name,
      time: timeRange(phase.starts_at, phase.duration_minutes),
      classes: PHASE_CLASSES[phase.phase],
      round: round.id,
    }
  }
  const block = blocks.value.get(ref.id)
  if (!block) return null
  return {
    title: block.title,
    subtitle: [block.place, block.responsibility].filter(Boolean).join(' · '),
    time: timeRange(block.starts_at, block.duration_minutes),
    classes: blockClasses(block.color),
    internal: !block.public,
  }
}

function describe(ref: ItemRef): string {
  const v = view(ref)
  if (!v) return ''
  const lines = [v.title, v.subtitle, v.time]
  if (ref.kind === 'phase') {
    const phase = phases.value.get(ref.id)
    if (phase) lines[0] = `${v.title} (${PHASE_LABELS[phase.phase]})`
  }
  if (v.internal && props.data.internal) lines.push(t('planner.internal'))
  for (const issue of issues.value[refKey(ref)] ?? []) lines.push(`⚠ ${issueText(issue)}`)
  return lines.filter(Boolean).join('\n')
}

const hoveredRound = ref<string>()

// --- Now indicator (M4-14-10) -----------------------------------------------

const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => (clock = setInterval(() => (now.value = new Date()), 30_000)))
onBeforeUnmount(() => clock && clearInterval(clock))
const nowMinutes = computed(() => now.value.getHours() * 60 + now.value.getMinutes())
const isToday = (day: PlannerDay) => day.date === localDate(now.value)

// --- Geometry ----------------------------------------------------------------

const scroller = ref<HTMLElement>()
const bodies = new Map<string, HTMLElement>()
function setBody(dayId: string, el: unknown) {
  if (el instanceof HTMLElement) bodies.set(dayId, el)
  else bodies.delete(dayId)
}

interface Hit {
  day: string
  col: number
  minute: number
}

/** Day, column and minute under the pointer; the nearest day if between days. */
function hit(clientX: number, clientY: number): Hit | null {
  let best: { day: string; rect: DOMRect; distance: number } | null = null
  for (const day of props.days) {
    const el = bodies.get(day.id)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    const distance =
      clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0
    if (!best || distance < best.distance) best = { day: day.id, rect, distance }
  }
  if (!best || best.distance > COL_W / 2) return null
  const col = clamp(
    Math.floor((clientX - best.rect.left) / COL_W),
    0,
    Math.max(0, props.columns.length - 1),
  )
  return { day: best.day, col, minute: axis.value.start + (clientY - best.rect.top) / props.scale }
}

// --- Dragging (M4-14-11, M4-14-12, M4-14-15) ----------------------------------

type DragMode = 'move' | 'resize' | 'create' | 'place'

interface Drag {
  mode: DragMode
  ref?: ItemRef
  startX: number
  startY: number
  active: boolean
  /** Pointer minute minus item start when grabbed. */
  grab: number
  duration: number
  start: number
  day: string
  col: number
  span: number
  /** A custom block in exactly one column may change column. */
  freeColumn: boolean
  /** Fixed column (category id) of phases. */
  category?: string
  /** Auto-scroll starts once the pointer was well inside the grid (not when entering it). */
  armed?: boolean
}

interface Preview {
  day: string
  col: number
  span: number
  start: number
  end: number
  label: string
}

const drag = ref<Drag | null>(null)
const preview = ref<Preview | null>(null)
const draggingKey = computed(() =>
  drag.value?.active && drag.value.ref ? refKey(drag.value.ref) : '',
)

function itemGeometry(ref: ItemRef, item?: LayoutItem) {
  const record: PlannerPhase | PlannerBlock | undefined =
    ref.kind === 'phase' ? phases.value.get(ref.id) : blocks.value.get(ref.id)
  if (!record) return null
  const block = ref.kind === 'block' ? (record as PlannerBlock) : null
  const phase = ref.kind === 'phase' ? (record as PlannerPhase) : null
  const category = phase ? rounds.value.get(phase.round)?.category : undefined
  return {
    record,
    start: toMinutes(record.starts_at) ?? axis.value.start,
    duration: record.duration_minutes,
    day: record.day,
    col: item?.col ?? (category ? columnIds.value.indexOf(category) : 0),
    span: item?.span ?? 1,
    freeColumn: !!block && coverageCount(block) === 1,
    category,
  }
}

function begin(event: PointerEvent, state: Omit<Drag, 'startX' | 'startY' | 'active'>) {
  if (event.button !== 0) return
  drag.value = { ...state, startX: event.clientX, startY: event.clientY, active: false }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', cancel)
}

function onItemDown(event: PointerEvent, item: LayoutItem) {
  if (!props.editable) return
  const g = itemGeometry(item.ref, item)
  if (!g) return
  const target = hit(event.clientX, event.clientY)
  begin(event, {
    mode: 'move',
    ref: item.ref,
    grab: target ? target.minute - g.start : 0,
    duration: g.duration,
    start: g.start,
    day: g.day,
    col: g.col,
    span: g.span,
    freeColumn: g.freeColumn,
    category: g.category,
  })
}

function onResizeDown(event: PointerEvent, item: LayoutItem) {
  if (!props.editable) return
  const g = itemGeometry(item.ref, item)
  if (!g) return
  begin(event, {
    mode: 'resize',
    ref: item.ref,
    grab: 0,
    duration: g.duration,
    start: g.start,
    day: g.day,
    col: item.col,
    span: item.span,
    freeColumn: false,
  })
}

function onBodyDown(event: PointerEvent, day: PlannerDay) {
  if (!props.editable || (event.target as HTMLElement).closest('[data-item]')) return
  const target = hit(event.clientX, event.clientY)
  if (!target) return
  const start = clampStart(Math.floor(target.minute / SNAP_MINUTES) * SNAP_MINUTES, 15)
  begin(event, {
    mode: 'create',
    grab: 0,
    duration: 0,
    start,
    day: day.id,
    col: target.col,
    span: 1,
    freeColumn: false,
  })
}

function onTrayDown(event: PointerEvent, phase: PlannerPhase) {
  const category = rounds.value.get(phase.round)?.category
  begin(event, {
    mode: 'place',
    ref: { kind: 'phase', id: phase.id },
    grab: 0,
    duration: phase.duration_minutes,
    start: 0,
    day: '',
    col: category ? columnIds.value.indexOf(category) : -1,
    span: 1,
    freeColumn: false,
    category,
  })
}

function autoScroll(event: PointerEvent) {
  const el = scroller.value
  if (!el || !props.contained) return
  // Only the part of the grid inside the window counts as its edge.
  const rect = el.getBoundingClientRect()
  const left = Math.max(rect.left, 0)
  const right = Math.min(rect.right, window.innerWidth)
  const top = Math.max(rect.top, 0)
  const bottom = Math.min(rect.bottom, window.innerHeight)
  const edge = 32
  const inside =
    event.clientX > left + edge &&
    event.clientX < right - edge &&
    event.clientY > top + edge &&
    event.clientY < bottom - edge
  const d = drag.value
  if (!d) return
  if (inside) d.armed = true
  if (!d.armed || inside) return
  if (event.clientX < left + edge) el.scrollLeft -= 12
  else if (event.clientX > right - edge) el.scrollLeft += 12
  if (event.clientY < top + edge) el.scrollTop -= 12
  else if (event.clientY > bottom - edge) el.scrollTop += 12
}

function onMove(event: PointerEvent) {
  const d = drag.value
  if (!d) return
  if (!d.active) {
    if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 4) return
    d.active = true
    document.body.style.userSelect = 'none'
  }
  autoScroll(event)
  const target = hit(event.clientX, event.clientY)
  if (d.mode === 'resize') {
    if (!target) return
    const end = clamp(snap(target.minute), d.start + MIN_DRAG_MINUTES, DAY_MINUTES)
    preview.value = {
      day: d.day,
      col: d.col,
      span: d.span,
      start: d.start,
      end,
      label: `${formatTime(d.start)}–${formatTime(end)} · ${end - d.start} min`,
    }
    return
  }
  if (d.mode === 'create') {
    if (!target) return
    const current = clamp(snap(target.minute), 0, DAY_MINUTES)
    const start = Math.min(d.start, current)
    const end = Math.max(d.start + SNAP_MINUTES, current)
    preview.value = {
      day: d.day,
      col: d.col,
      span: 1,
      start,
      end,
      label: `${formatTime(start)}–${formatTime(end)}`,
    }
    return
  }
  // move / place
  if (!target || (d.mode === 'place' && d.col < 0)) {
    preview.value = null
    return
  }
  const start = clampStart(snap(target.minute - d.grab), d.duration)
  const col = d.freeColumn ? target.col : d.col
  if (col < 0) return
  preview.value = {
    day: target.day,
    col,
    span: d.span,
    start,
    end: start + d.duration,
    label: `${formatTime(start)}–${formatTime(start + d.duration)}`,
  }
}

function finish() {
  drag.value = null
  preview.value = null
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', cancel)
}

function cancel() {
  finish()
}

function onUp(event: PointerEvent) {
  const d = drag.value
  const p = preview.value
  finish()
  if (!d) return
  if (!d.active) {
    if (d.ref && (d.mode === 'move' || d.mode === 'place')) emit('open', d.ref)
    if (d.mode === 'create') {
      emit('create', {
        day: d.day,
        column: props.columns[d.col]?.id ?? '',
        custom: !!props.columns[d.col]?.custom,
        starts_at: formatTime(d.start),
        duration_minutes: 30,
      })
    }
    return
  }
  if (!p) return
  if (d.mode === 'create') {
    emit('create', {
      day: p.day,
      column: props.columns[p.col]?.id ?? '',
      custom: !!props.columns[p.col]?.custom,
      starts_at: formatTime(p.start),
      duration_minutes: Math.max(MIN_DRAG_MINUTES, p.end - p.start),
    })
  } else if (d.mode === 'resize' && d.ref) {
    if (p.end - p.start !== d.duration) emit('resize', d.ref, p.end - p.start)
  } else if (d.ref) {
    const changedColumn = d.freeColumn && p.col !== d.col
    if (d.mode === 'move' && p.day === d.day && p.start === d.start && !changedColumn) return
    focusAfterUpdate(refKey(d.ref))
    emit('move', {
      ref: d.ref,
      placement: { day: p.day, starts_at: formatTime(p.start) },
      coverage: changedColumn ? coverageOf(props.columns[p.col]!) : undefined,
      later: d.mode === 'move' && (event.shiftKey || props.moveLater),
    })
  }
}

onBeforeUnmount(finish)

function coverageOf(column: GridColumn) {
  return column.custom
    ? { categories: [], columns: [column.id] }
    : { categories: [column.id], columns: [] }
}

// --- Keyboard (M4-14-17) ---------------------------------------------------------

function onItemKey(event: KeyboardEvent, item: LayoutItem) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('open', item.ref)
    return
  }
  if (!props.editable) return
  const g = itemGeometry(item.ref, item)
  if (!g) return
  const step = event.shiftKey ? 15 : SNAP_MINUTES
  const key = refKey(item.ref)
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    const duration = clamp(
      g.duration + (event.key === 'ArrowDown' ? step : -step),
      MIN_DRAG_MINUTES,
      DAY_MINUTES - g.start,
    )
    focusAfterUpdate(key)
    if (duration !== g.duration) emit('resize', item.ref, duration)
    return
  }
  let dayIndex = props.days.findIndex((d) => d.id === g.day)
  let start = g.start
  if (event.key === 'ArrowUp') start -= step
  else if (event.key === 'ArrowDown') start += step
  else if (event.key === 'ArrowLeft') dayIndex -= 1
  else if (event.key === 'ArrowRight') dayIndex += 1
  else return
  event.preventDefault()
  const day = props.days[dayIndex]
  start = clampStart(start, g.duration)
  if (!day || (day.id === g.day && start === g.start)) return
  focusAfterUpdate(key)
  emit('move', {
    ref: item.ref,
    placement: { day: day.id, starts_at: formatTime(start) },
    later: props.moveLater,
  })
}

// Items re-render (possibly in another day) after a change; keep the keyboard focus on them.
let pendingFocus = ''
function focusAfterUpdate(key: string) {
  if (document.activeElement?.closest('[data-item]')) pendingFocus = key
}
watch(
  () => props.data,
  async () => {
    if (!pendingFocus) return
    const key = pendingFocus
    pendingFocus = ''
    await nextTick()
    scroller.value?.querySelector<HTMLElement>(`[data-item^="${key}"]`)?.focus()
  },
)

// --- Scrolling ---------------------------------------------------------------------

function scrollToItem(ref: ItemRef) {
  const el = scroller.value?.querySelector<HTMLElement>(`[data-item^="${refKey(ref)}"]`)
  el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
}

function scrollToDay(dayId: string) {
  const el = bodies.get(dayId)
  const box = scroller.value
  if (!el || !box) return
  box.scrollLeft += el.getBoundingClientRect().left - box.getBoundingClientRect().left - AXIS_W
  const first = layouts.value[dayId]?.reduce((m, i) => Math.min(m, i.start), DAY_MINUTES)
  if (first !== undefined && first < DAY_MINUTES) {
    box.scrollTop = Math.max(0, (first - axis.value.start) * props.scale - 40)
  }
}

defineExpose({ scrollToItem, scrollToDay })

function dayShade(day: PlannerDay) {
  const start = toMinutes(day.starts_at) ?? axis.value.start
  const end = toMinutes(day.ends_at) ?? axis.value.end
  return [
    { key: 'before', top: axis.value.start, height: Math.max(0, start - axis.value.start) },
    { key: 'after', top: end, height: Math.max(0, axis.value.end - end) },
  ].filter((s) => s.height > 0)
}
</script>

<template>
  <div class="flex flex-col gap-3 lg:flex-row" :class="{ 'select-none': drag?.active }">
    <!-- Unplanned tray (M4-14-09) -->
    <aside
      v-if="editable && tray.length"
      class="flex shrink-0 flex-col gap-2 rounded-md border p-2 lg:w-56 print:hidden"
      :aria-label="t('planner.board.unplaced')"
      data-testid="planner-tray"
    >
      <p class="px-1 text-sm font-medium">{{ t('planner.board.unplaced') }}</p>
      <p class="px-1 text-xs text-muted-foreground">
        {{ t('planner.board.trayHint') }}
      </p>
      <ul class="flex max-h-48 flex-col gap-1 overflow-auto lg:max-h-[60vh]">
        <li v-for="phase in tray" :key="phase.id">
          <div
            role="button"
            tabindex="0"
            class="flex touch-none cursor-grab items-center gap-1 rounded border px-2 py-1 text-xs"
            :class="PHASE_CLASSES[phase.phase]"
            :data-tray="phase.id"
            :title="`${rounds.get(phase.round)?.name} · ${PHASE_LABELS[phase.phase]} · ${t('planner.minutesShort', { count: phase.duration_minutes })}`"
            @pointerdown="onTrayDown($event, phase)"
            @keydown.enter.prevent="emit('open', { kind: 'phase', id: phase.id })"
          >
            <GripVerticalIcon class="size-3 shrink-0 opacity-60" />
            <span class="truncate font-medium">{{ rounds.get(phase.round)?.key }}</span>
            <span class="truncate">{{ PHASE_SHORT[phase.phase] }}</span>
            <span class="ml-auto shrink-0 opacity-80">{{ phase.duration_minutes }}′</span>
          </div>
        </li>
      </ul>
    </aside>

    <div
      ref="scroller"
      class="planner-scroll relative min-w-0 flex-1 overflow-auto rounded-md border bg-background print:max-h-none print:overflow-visible print:border-0"
      :class="{ 'max-h-[calc(100vh-13rem)] min-h-80': contained }"
      :style="printVars"
      data-testid="planner-grid"
    >
      <p v-if="!days.length" class="p-6 text-sm text-muted-foreground">
        {{ t('planner.board.noDays') }}
      </p>
      <div v-else class="flex w-max print:block">
        <!-- Time axis -->
        <div
          class="sticky left-0 z-30 shrink-0 border-r bg-background print:hidden"
          :style="{ width: `${AXIS_W}px` }"
        >
          <div
            class="sticky top-0 z-10 border-b bg-background"
            :style="{ height: `${HEADER_H}px` }"
          />
          <div class="relative" :style="{ height: h(axis.end - axis.start) }" aria-hidden="true">
            <span
              v-for="m in hours"
              :key="m"
              class="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground first:translate-y-0"
              :style="{ top: y(m) }"
              >{{ formatTime(m) }}</span
            >
          </div>
        </div>

        <section
          v-for="day in days"
          :key="day.id"
          class="shrink-0 border-r print:flex print:border-r-0 print:[&:not(:first-of-type)]:break-before-page"
          :aria-label="dayName(day)"
          :data-day="day.id"
        >
          <!-- Axis repeated per day when printed -->
          <div
            class="relative hidden w-12 print:block"
            :style="{ marginTop: `${HEADER_H}px`, height: h(axis.end - axis.start) }"
          >
            <span
              v-for="m in hours"
              :key="m"
              class="absolute right-1 text-[10px] tabular-nums"
              :style="{ top: y(m) }"
              >{{ formatTime(m) }}</span
            >
          </div>
          <div>
            <header
              class="sticky top-0 z-20 border-b bg-background"
              :style="{
                height: `${HEADER_H}px`,
                width: `calc(var(--col) * ${Math.max(1, columns.length)})`,
              }"
            >
              <div class="flex h-8 min-w-0 items-center gap-2 px-2 text-sm">
                <span class="shrink-0 font-semibold">{{ day.label || formatDay(day.date) }}</span>
                <span v-if="day.label" class="min-w-0 truncate text-xs text-muted-foreground">{{
                  formatDay(day.date)
                }}</span>
                <span class="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground"
                  >{{ day.starts_at }}–{{ day.ends_at }}</span
                >
              </div>
              <div class="flex">
                <div
                  v-for="column in columns"
                  :key="column.id"
                  class="truncate border-t border-l px-2 py-1 text-xs font-medium first:border-l-0"
                  :class="{ 'bg-muted/60 text-muted-foreground italic': column.custom }"
                  :style="{ width: 'var(--col)' }"
                  :title="
                    column.custom
                      ? `${column.name} (${t('planner.board.customColumn')})`
                      : column.name
                  "
                  :data-column="column.id"
                >
                  {{ column.name }}
                </div>
              </div>
            </header>

            <div
              :ref="(el) => setBody(day.id, el)"
              class="planner-body relative"
              :class="{ 'cursor-crosshair': editable }"
              :style="{
                width: `calc(var(--col) * ${Math.max(1, columns.length)})`,
                height: h(axis.end - axis.start),
              }"
              @pointerdown="onBodyDown($event, day)"
            >
              <!-- Outside the day's hours -->
              <div
                v-for="shade in dayShade(day)"
                :key="shade.key"
                class="planner-shade pointer-events-none absolute inset-x-0"
                :style="{ top: y(shade.top), height: h(shade.height) }"
              />
              <!-- Column separators; custom columns are tinted -->
              <div
                v-for="(column, i) in columns"
                :key="column.id"
                class="pointer-events-none absolute inset-y-0 border-l first:border-l-0"
                :class="{ 'bg-muted/30': column.custom }"
                :style="{ left: `calc(var(--col) * ${i})`, width: 'var(--col)' }"
              />

              <div
                v-for="item in layouts[day.id]"
                :key="item.key"
                :data-item="item.key"
                role="button"
                tabindex="0"
                class="absolute flex flex-col overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-xs leading-tight shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
                :class="[
                  view(item.ref)?.classes,
                  editable ? 'touch-none cursor-grab' : 'cursor-pointer',
                  draggingKey === refKey(item.ref) ? 'opacity-40' : '',
                  selected === refKey(item.ref) ? 'ring-2 ring-ring' : '',
                  hoveredRound && view(item.ref)?.round === hoveredRound
                    ? 'ring-2 ring-ring/70'
                    : '',
                  issues[refKey(item.ref)] ? 'outline-2 outline-offset-0 outline-destructive' : '',
                ]"
                :style="{
                  ...itemStyle(item),
                  top: y(item.start),
                  height: h(item.end - item.start),
                }"
                :title="describe(item.ref)"
                :aria-label="describe(item.ref)"
                @pointerdown="onItemDown($event, item)"
                @click="!editable && emit('open', item.ref)"
                @keydown="onItemKey($event, item)"
                @mouseenter="hoveredRound = view(item.ref)?.round"
                @mouseleave="hoveredRound = undefined"
              >
                <span class="flex items-center gap-1 font-semibold">
                  <span class="truncate">{{ view(item.ref)?.title }}</span>
                  <EyeOffIcon
                    v-if="view(item.ref)?.internal && data.internal"
                    class="size-3 shrink-0 opacity-70"
                    aria-hidden="true"
                  />
                  <AlertTriangleIcon
                    v-if="issues[refKey(item.ref)]"
                    class="ml-auto size-3.5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                </span>
                <span class="truncate opacity-80">{{ view(item.ref)?.time }}</span>
                <span v-if="view(item.ref)?.subtitle" class="truncate opacity-80">{{
                  view(item.ref)?.subtitle
                }}</span>
                <span
                  v-if="editable"
                  class="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                  data-resize
                  aria-hidden="true"
                  @pointerdown.stop="onResizeDown($event, item)"
                />
              </div>

              <!-- Drag preview -->
              <div
                v-if="preview && preview.day === day.id"
                class="pointer-events-none absolute z-10 flex items-start rounded-md border-2 border-dashed border-ring bg-ring/15 px-1.5 py-0.5 text-xs font-medium"
                :style="{
                  ...itemStyle({ col: preview.col, span: preview.span, lane: 0, lanes: 1 }),
                  top: y(preview.start),
                  height: h(preview.end - preview.start),
                }"
                data-testid="planner-preview"
              >
                {{ preview.label }}
              </div>

              <!-- Now -->
              <div
                v-if="isToday(day) && nowMinutes >= axis.start && nowMinutes <= axis.end"
                class="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive print:hidden"
                :style="{ top: y(nowMinutes) }"
                data-testid="planner-now"
              >
                <span
                  class="absolute -top-2 left-0 size-3 -translate-x-1/2 rounded-full bg-destructive"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.planner-body {
  background-image:
    repeating-linear-gradient(
      to bottom,
      color-mix(in oklab, var(--border) 100%, transparent) 0 1px,
      transparent 1px calc(60 * var(--ppm))
    ),
    repeating-linear-gradient(
      to bottom,
      color-mix(in oklab, var(--border) 45%, transparent) 0 1px,
      transparent 1px calc(15 * var(--ppm))
    );
}

.planner-shade {
  background: repeating-linear-gradient(
    135deg,
    color-mix(in oklab, var(--muted) 90%, transparent) 0 6px,
    color-mix(in oklab, var(--muted) 50%, transparent) 6px 12px
  );
}

@media print {
  .planner-scroll {
    --ppm: var(--ppm-print) !important;
    --col: var(--col-print) !important;
  }
}
</style>
