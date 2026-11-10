<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MaximizeIcon, MinusIcon, PlusIcon } from '@lucide/vue'
import {
  inputPoint,
  nodeHeight,
  NODE_WIDTH,
  HEADER_HEIGHT,
  PORT_HEIGHT,
  outputPoint,
  wirePath,
  type DiagramNode,
  type DiagramWire,
} from './types'

/**
 * LabVIEW-style block diagram canvas. Data flows left to right: drag from a block's output
 * terminal (right) to another block's input terminal (left) or enable terminal (top) to wire
 * them. Drag a block to move it, drag the background to pan, scroll or use the buttons to
 * zoom. Everything a wire does can also be done in the builder's inspector, so the canvas is
 * never the only way (touch, keyboard, screen readers).
 */
const props = defineProps<{
  nodes: DiagramNode[]
  wires: DiagramWire[]
  readonly?: boolean
  /** Selected block id, or "wire:<id>". */
  selected?: string | null
}>()
const emit = defineEmits<{
  select: [id: string | null]
  move: [id: string, x: number, y: number]
  connect: [from: string, to: string, port: string]
  delete: [id: string]
}>()

const svg = ref<SVGSVGElement>()
const view = reactive({ x: 24, y: 24, k: 1 })
const byId = computed(() => new Map(props.nodes.map((n) => [n.id, n])))

type Drag =
  | { mode: 'node'; id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean }
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { mode: 'wire'; from: string; x: number; y: number }
const drag = ref<Drag | null>(null)
const hoverPort = ref<string | null>(null)

function toWorld(clientX: number, clientY: number) {
  const rect = svg.value?.getBoundingClientRect()
  const left = rect?.left ?? 0
  const top = rect?.top ?? 0
  return { x: (clientX - left - view.x) / view.k, y: (clientY - top - view.y) / view.k }
}

function portAt(clientX: number, clientY: number) {
  const el = document.elementFromPoint?.(clientX, clientY)
  const port = el?.closest?.('[data-port]') as HTMLElement | null
  if (!port) return null
  return { node: port.dataset.node!, port: port.dataset.port! }
}

function capture(e: PointerEvent) {
  try {
    svg.value?.setPointerCapture(e.pointerId)
  } catch {
    // Not supported (tests) or pointer already released.
  }
}

function onNodeDown(e: PointerEvent, node: DiagramNode) {
  if (e.button !== 0) return
  e.stopPropagation()
  const p = toWorld(e.clientX, e.clientY)
  drag.value = {
    mode: 'node',
    id: node.id,
    dx: p.x - node.x,
    dy: p.y - node.y,
    sx: e.clientX,
    sy: e.clientY,
    moved: false,
  }
  capture(e)
}

function onOutputDown(e: PointerEvent, node: DiagramNode) {
  if (e.button !== 0 || props.readonly) return
  e.stopPropagation()
  const p = toWorld(e.clientX, e.clientY)
  drag.value = { mode: 'wire', from: node.id, x: p.x, y: p.y }
  emit('select', node.id)
  capture(e)
}

function onBackgroundDown(e: PointerEvent) {
  if (e.button !== 0) return
  drag.value = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }
  capture(e)
}

function onMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  if (d.mode === 'pan') {
    d.moved ||= Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3
    view.x = d.ox + e.clientX - d.sx
    view.y = d.oy + e.clientY - d.sy
  } else if (d.mode === 'node') {
    d.moved ||= Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3
    if (!d.moved) return
    const p = toWorld(e.clientX, e.clientY)
    emit('move', d.id, Math.round(p.x - d.dx), Math.round(p.y - d.dy))
  } else {
    const p = toWorld(e.clientX, e.clientY)
    d.x = p.x
    d.y = p.y
    const target = portAt(e.clientX, e.clientY)
    hoverPort.value = target ? `${target.node}/${target.port}` : null
  }
}

function onUp(e: PointerEvent) {
  const d = drag.value
  drag.value = null
  hoverPort.value = null
  if (!d) return
  if (d.mode === 'pan' && !d.moved) emit('select', null)
  if (d.mode === 'node' && !d.moved) emit('select', d.id)
  if (d.mode === 'wire') {
    const target = portAt(e.clientX, e.clientY)
    if (target && target.node !== d.from) emit('connect', d.from, target.node, target.port)
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY)
}

function zoomAt(factor: number, clientX?: number, clientY?: number) {
  const rect = svg.value?.getBoundingClientRect()
  const cx = clientX ?? (rect ? rect.left + rect.width / 2 : 0)
  const cy = clientY ?? (rect ? rect.top + rect.height / 2 : 0)
  const before = toWorld(cx, cy)
  view.k = Math.min(2, Math.max(0.3, view.k * factor))
  const left = rect?.left ?? 0
  const top = rect?.top ?? 0
  view.x = cx - left - before.x * view.k
  view.y = cy - top - before.y * view.k
}

/** Zooms and pans so that every block is visible. */
function fit() {
  const el = svg.value
  if (!el || !props.nodes.length) return
  const width = el.clientWidth
  const height = el.clientHeight
  if (!width || !height) return
  const minX = Math.min(...props.nodes.map((n) => n.x)) - 24
  const minY = Math.min(...props.nodes.map((n) => n.y)) - 36
  const maxX = Math.max(...props.nodes.map((n) => n.x + NODE_WIDTH)) + 48
  const maxY = Math.max(...props.nodes.map((n) => n.y + nodeHeight(n))) + 24
  view.k = Math.min(1.2, Math.max(0.3, Math.min(width / (maxX - minX), height / (maxY - minY))))
  view.x = (width - (maxX - minX) * view.k) / 2 - minX * view.k
  view.y = (height - (maxY - minY) * view.k) / 2 - minY * view.k
}
defineExpose({ fit })

onMounted(() => nextTick(fit))
// Fit once when the first blocks arrive (e.g. after loading).
watch(
  () => props.nodes.length > 0,
  (has, had) => {
    if (has && !had) void nextTick(fit)
  },
)

function onKey(e: KeyboardEvent) {
  if (props.readonly || !props.selected) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    emit('delete', props.selected)
  }
}

const drawnWires = computed(() => {
  const drawn = props.wires.flatMap((w) => {
    const from = byId.value.get(w.from)
    const to = byId.value.get(w.to)
    if (!from || !to) return []
    return [
      { w, start: outputPoint(from), end: inputPoint(to, w.port), enable: w.port === 'enable' },
    ]
  })
  // One vertical lane per wire entering the same column, ordered top to bottom.
  const lanes = new Map<number, typeof drawn>()
  for (const d of drawn) if (!d.enable) lanes.set(d.end.x, [...(lanes.get(d.end.x) ?? []), d])
  const lane = new Map<string, { lane: number; spacing: number }>()
  for (const list of lanes.values()) {
    list.sort((a, b) => a.end.y - b.end.y || a.start.y - b.start.y)
    const spacing = Math.min(7, 64 / Math.max(list.length, 1))
    list.forEach((d, i) => lane.set(d.w.id, { lane: list.length - 1 - i, spacing }))
  }
  return drawn.map((d) => {
    const l = lane.get(d.w.id)
    return { ...d.w, d: wirePath(d.start, d.end, d.enable, l?.lane, l?.spacing) }
  })
})

const pending = computed(() => {
  const d = drag.value
  if (d?.mode !== 'wire') return null
  const from = byId.value.get(d.from)
  if (!from) return null
  return { d: wirePath(outputPoint(from), { x: d.x, y: d.y }), tone: from.tone }
})

const clip = (text: string, width: number) => {
  const max = Math.floor(width / 6.6)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function nodeLabel(n: DiagramNode) {
  const parts = [n.title, n.subtitle, ...(n.errors ?? [])].filter(Boolean)
  return parts.join('. ')
}
</script>

<template>
  <div
    class="bd-root relative overflow-hidden rounded-lg border bg-[var(--bd-canvas)]"
    data-testid="block-diagram"
  >
    <svg
      ref="svg"
      class="block h-[640px] w-full touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabindex="0"
      role="application"
      aria-label="Block diagram"
      aria-roledescription="block diagram"
      @pointerdown="onBackgroundDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel="onWheel"
      @keydown="onKey"
    >
      <defs>
        <pattern id="bd-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" class="stroke-[var(--bd-grid)]" stroke-width="1" />
        </pattern>
      </defs>
      <rect
        :x="-view.x / view.k"
        :y="-view.y / view.k"
        width="10000"
        height="10000"
        :transform="`translate(${view.x},${view.y}) scale(${view.k})`"
        fill="url(#bd-grid)"
      />
      <g :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
        <!-- Wires below blocks. A wide transparent path makes them easy to hit. -->
        <g v-for="w in drawnWires" :key="w.id" :data-wire="w.id">
          <path
            :d="w.d"
            fill="none"
            stroke="transparent"
            stroke-width="12"
            class="cursor-pointer"
            @pointerdown.stop="emit('select', `wire:${w.id}`)"
          />
          <path
            :d="w.d"
            fill="none"
            :class="[
              `bd-wire bd-tone-${w.tone}`,
              { 'bd-wire-selected': selected === `wire:${w.id}`, 'bd-wire-error': w.error },
            ]"
            :stroke-width="w.thick ? 4 : 2"
            :stroke-dasharray="w.dashed ? '6 4' : undefined"
            pointer-events="none"
          />
        </g>
        <path
          v-if="pending"
          :d="pending.d"
          fill="none"
          :class="`bd-wire bd-tone-${pending.tone}`"
          stroke-width="2"
          stroke-dasharray="3 3"
          pointer-events="none"
        />

        <g
          v-for="n in nodes"
          :key="n.id"
          :transform="`translate(${n.x},${n.y})`"
          :data-block="n.id"
          :class="[
            'bd-block',
            `bd-tone-${n.tone}`,
            `bd-shape-${n.shape}`,
            { 'opacity-45': n.inactive },
          ]"
          role="button"
          tabindex="0"
          :aria-label="nodeLabel(n)"
          :aria-pressed="selected === n.id"
          @pointerdown="onNodeDown($event, n)"
          @keydown.enter.prevent="emit('select', n.id)"
          @keydown.space.prevent="emit('select', n.id)"
        >
          <title>{{ nodeLabel(n) }}</title>
          <!-- Selection halo -->
          <rect
            v-if="selected === n.id"
            x="-5"
            y="-5"
            :width="NODE_WIDTH + 10"
            :height="nodeHeight(n) + 10"
            rx="9"
            class="fill-none stroke-[var(--bd-select)]"
            stroke-width="3"
          />
          <rect
            :width="NODE_WIDTH"
            :height="nodeHeight(n)"
            :rx="n.shape === 'function' ? 4 : 6"
            class="bd-body"
            :class="{ 'bd-body-error': n.errors?.length }"
            :stroke-width="n.shape === 'indicator' ? 3 : 2"
          />
          <rect
            v-if="n.shape === 'indicator'"
            x="4"
            y="4"
            :width="NODE_WIDTH - 8"
            :height="nodeHeight(n) - 8"
            rx="4"
            class="fill-none bd-stroke"
            stroke-width="1"
          />
          <!-- Terminal icon -->
          <rect x="8" y="8" width="34" height="28" rx="3" class="bd-icon" />
          <text
            x="25"
            y="27"
            text-anchor="middle"
            class="bd-icon-text"
            :font-size="n.glyph.length > 3 ? 9 : n.glyph.length > 2 ? 11 : 14"
          >
            {{ n.glyph }}
          </text>
          <text x="50" y="20" class="bd-title">{{ clip(n.title, NODE_WIDTH - 58) }}</text>
          <text v-if="n.subtitle" x="50" y="35" class="bd-subtitle">
            {{ clip(n.subtitle, NODE_WIDTH - 58) }}
          </text>
          <!-- Badges along the bottom right -->
          <g v-if="n.badges?.length">
            <text :x="NODE_WIDTH - 8" :y="nodeHeight(n) - 8" text-anchor="end" class="bd-badge">
              {{ n.badges.join('  ') }}
            </text>
          </g>
          <!-- Error marker -->
          <g v-if="n.errors?.length" :transform="`translate(${NODE_WIDTH - 12},-8)`">
            <circle r="9" class="fill-destructive" />
            <text y="4" text-anchor="middle" class="fill-white text-[12px] font-bold">!</text>
          </g>

          <!-- Input terminals -->
          <g
            v-for="(port, i) in n.inputs"
            :key="port.id"
            :transform="`translate(0,${HEADER_HEIGHT + PORT_HEIGHT * (i + 0.5)})`"
          >
            <rect
              x="-7"
              y="-7"
              width="14"
              height="14"
              rx="2"
              :data-node="n.id"
              :data-port="port.id"
              :class="[
                'bd-port',
                {
                  'bd-port-spare': port.spare,
                  'bd-port-hover': hoverPort === `${n.id}/${port.id}`,
                },
              ]"
            />
            <text x="12" y="4" class="bd-port-label">
              {{ clip(port.label ?? '', NODE_WIDTH - 30) }}
            </text>
          </g>
          <!-- Enable terminal (condition) -->
          <g v-if="n.enable" :transform="`translate(${NODE_WIDTH / 2},0)`">
            <path
              d="M-8,-8 L8,-8 L0,4 Z"
              :data-node="n.id"
              data-port="enable"
              :class="[
                'bd-port bd-port-enable',
                { 'bd-port-hover': hoverPort === `${n.id}/enable` },
              ]"
            >
              <title>Enable: wire a criterion here to make this block conditional</title>
            </path>
          </g>
          <!-- Output terminal -->
          <g v-if="n.output" :transform="`translate(${NODE_WIDTH},${nodeHeight(n) / 2})`">
            <circle v-if="n.negated" cx="-14" r="7" class="bd-negate" />
            <text v-if="n.negated" x="-14" y="4" text-anchor="middle" class="bd-negate-text">
              −
            </text>
            <path
              d="M0,-8 L10,0 L0,8 Z"
              :class="['bd-port bd-port-out', { 'cursor-crosshair': !readonly }]"
              :data-output="n.id"
              @pointerdown="onOutputDown($event, n)"
            >
              <title>Output: drag to a terminal to wire</title>
            </path>
            <!-- Probe -->
            <g v-if="n.probe" transform="translate(16,-30)" :data-probe="n.id">
              <rect
                :width="Math.max(26, n.probe.length * 7 + 10)"
                height="18"
                rx="3"
                class="bd-probe"
              />
              <text x="5" y="13" class="bd-probe-text">{{ n.probe }}</text>
            </g>
          </g>
        </g>
      </g>
    </svg>

    <div class="absolute right-2 bottom-2 flex gap-1">
      <button
        type="button"
        class="rounded-md border bg-background p-1.5 shadow-sm hover:bg-muted"
        aria-label="Zoom in"
        @click="zoomAt(1.2)"
      >
        <PlusIcon class="size-4" />
      </button>
      <button
        type="button"
        class="rounded-md border bg-background p-1.5 shadow-sm hover:bg-muted"
        aria-label="Zoom out"
        @click="zoomAt(1 / 1.2)"
      >
        <MinusIcon class="size-4" />
      </button>
      <button
        type="button"
        class="rounded-md border bg-background p-1.5 shadow-sm hover:bg-muted"
        aria-label="Fit diagram"
        @click="fit"
      >
        <MaximizeIcon class="size-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* LabVIEW-like palette: data types have fixed colours, primitives are pale yellow. */
.bd-root {
  --bd-canvas: #ffffff;
  --bd-grid: #eef0f3;
  --bd-select: #2563eb;
  --bd-function: #fffbd1;
  --bd-control: #ffffff;
  --bd-text: #18181b;
  --bd-muted: #52525b;
  --bd-probe: #fef08a;
  --bd-boolean: #00873c;
  --bd-number: #e86a00;
  --bd-select-tone: #1d4ed8;
  --bd-group: #e86a00;
  --bd-cluster: #8b5a2b;
}
:global(.dark) .bd-root {
  --bd-canvas: #111113;
  --bd-grid: #1d1d21;
  --bd-select: #60a5fa;
  --bd-function: #34301a;
  --bd-control: #1c1c20;
  --bd-text: #f4f4f5;
  --bd-muted: #a1a1aa;
  --bd-probe: #a16207;
  --bd-boolean: #34d27a;
  --bd-number: #ff9a3d;
  --bd-select-tone: #6b9cff;
  --bd-group: #ff9a3d;
  --bd-cluster: #d29a62;
}
.bd-tone-boolean {
  --tone: var(--bd-boolean);
}
.bd-tone-number {
  --tone: var(--bd-number);
}
.bd-tone-select {
  --tone: var(--bd-select-tone);
}
.bd-tone-group {
  --tone: var(--bd-group);
}
.bd-tone-round,
.bd-tone-calc,
.bd-tone-sink {
  --tone: var(--bd-cluster);
}
.bd-wire {
  stroke: var(--tone);
}
.bd-wire-selected {
  stroke: var(--bd-select);
}
.bd-wire-error {
  stroke: var(--color-destructive, #dc2626);
}
.bd-block {
  cursor: grab;
}
.bd-block:focus {
  outline: none;
}
.bd-block:focus-visible .bd-body {
  stroke: var(--bd-select);
}
.bd-body {
  fill: var(--bd-control);
  stroke: var(--tone);
}
.bd-shape-function .bd-body {
  fill: var(--bd-function);
  stroke: var(--bd-text);
}
.bd-body-error {
  stroke: var(--color-destructive, #dc2626) !important;
  stroke-dasharray: 5 3;
}
.bd-stroke {
  stroke: var(--tone);
}
.bd-icon {
  fill: var(--tone);
}
.bd-icon-text {
  fill: #fff;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.bd-title {
  fill: var(--bd-text);
  font-size: 13px;
  font-weight: 600;
}
.bd-subtitle,
.bd-port-label {
  fill: var(--bd-muted);
  font-size: 11px;
}
.bd-badge {
  fill: var(--tone);
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.bd-port {
  fill: var(--bd-control);
  stroke: var(--tone);
  stroke-width: 2;
}
.bd-shape-function .bd-port {
  stroke: var(--bd-text);
}
.bd-port-spare {
  stroke-dasharray: 2 2;
  fill: transparent;
}
.bd-port-enable {
  fill: var(--bd-boolean);
  stroke: var(--bd-boolean);
}
.bd-port-out {
  fill: var(--tone);
  stroke: var(--tone);
}
.bd-port-hover {
  stroke: var(--bd-select) !important;
  fill: var(--bd-select) !important;
}
.bd-negate {
  fill: var(--bd-control);
  stroke: var(--tone);
  stroke-width: 2;
}
.bd-negate-text {
  fill: var(--tone);
  font-size: 13px;
  font-weight: 700;
}
.bd-probe {
  fill: var(--bd-probe);
  stroke: var(--bd-text);
  stroke-width: 1;
}
.bd-probe-text {
  fill: var(--bd-text);
  font-size: 11px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
</style>
