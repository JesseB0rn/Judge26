<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { toast } from 'vue-sonner'
import type { Explanation } from '@judge26/scoring-engine'
import { Button } from '@/components/ui/button'
import BlockDiagram from '@/shared/diagram/BlockDiagram.vue'
import BuilderFrame from '@/shared/diagram/BuilderFrame.vue'
import { useBuilderState } from '@/shared/diagram/useBuilderState'
import { parseRuleset } from '../lib'
import {
  addNode,
  connect,
  disconnectCondition,
  isBuildable,
  issuesByNode,
  nodeAt,
  PALETTE,
  removeNode,
  targetGroup,
  toDiagram,
  type Draft,
} from '../builder'
import ScoringInspector from './ScoringInspector.vue'

/**
 * Visual rule builder (M2-15), LabVIEW style: criteria are controls on the left, groups are
 * function blocks, the total is the indicator on the right. Wires carry points; dashed green
 * wires into a block's top terminal are conditions. It edits the same JSON text as the JSON
 * editor (v-model), with the same validation.
 */
const props = defineProps<{ readonly?: boolean; explanation?: Explanation }>()
const text = defineModel<string>({ required: true })
const state = useBuilderState(text)
const { selected, positions, history } = state
const diagramRef = ref<InstanceType<typeof BlockDiagram>>()

const parsed = computed(() => parseRuleset(text.value))
const def = computed(() => (isBuildable(parsed.value.definition) ? parsed.value.definition : null))

const diagram = computed(() =>
  def.value
    ? toDiagram(def.value, {
        issues: parsed.value.issues,
        explanation: parsed.value.ruleset ? props.explanation : undefined,
        positions: positions.value,
      })
    : { nodes: [], wires: [] },
)
const issueInfo = computed(() =>
  def.value ? issuesByNode(def.value, parsed.value.issues) : { map: new Map(), general: [] },
)
const selectedNode = computed(() => {
  const key = selected.value
  if (!def.value || key === null || key.startsWith('wire:')) return null
  return nodeAt(def.value, key) ? key : null
})

/** Inspector edits: a new selection (key given) means blocks moved, so re-layout. */
function onApply(next: Draft, key?: string | null) {
  state.apply(next, { select: key, relayout: key !== undefined })
}

function add(item: (typeof PALETTE)[number]) {
  if (!def.value || props.readonly) return
  const parent = targetGroup(def.value, selectedNode.value)
  const result = addNode(def.value, item.type, parent, item.aggregate)
  state.apply(result.def, { select: result.key })
}

function onConnect(from: string, to: string, port: string) {
  if (!def.value || props.readonly) return
  const result = connect(def.value, from, to, port)
  if (typeof result === 'string') toast.error(result)
  else state.apply(result, { select: port === 'enable' ? to : null })
}

function onDelete(id: string) {
  if (!def.value || props.readonly) return
  if (id.startsWith('wire:cond:')) {
    // wire:cond:<target key>:<ref id>
    const [, , target, ref] = id.split(':')
    state.apply(disconnectCondition(def.value, target!, ref!), { select: null })
  } else if (id.startsWith('wire:data:')) {
    toast.info(
      'Every block must be wired into a group. Wire it into another group, or delete the block.',
    )
  } else if (id !== '') {
    state.apply(removeNode(def.value, id), { select: null })
  }
}

async function tidy() {
  positions.value = new Map()
  await nextTick()
  diagramRef.value?.fit()
}

const tone = (type: string) =>
  type === 'boolean' ? 'bg-[#00873c]' : type === 'select' ? 'bg-[#1d4ed8]' : 'bg-[#e86a00]'
</script>

<template>
  <div data-testid="ruleset-builder" @keydown="state.onKeydown($event, readonly)">
    <p v-if="parsed.syntaxError" class="text-sm text-destructive" role="alert">
      The JSON has a syntax error ({{ parsed.syntaxError }}). Fix it in the JSON editor first.
    </p>
    <p v-else-if="!def" class="text-sm text-destructive" role="alert">
      The definition has no root group the builder can show. Fix it in the JSON editor first.
    </p>

    <BuilderFrame
      v-else
      :issue-count="parsed.issues.length"
      :can-undo="history.length > 0"
      :readonly="readonly"
      @undo="state.undo"
      @tidy="tidy"
    >
      <template #palette>
        <Button
          v-for="item in PALETTE"
          :key="item.label"
          variant="outline"
          size="sm"
          :aria-label="`Add ${item.label}`"
          @click="add(item)"
        >
          <span
            class="rounded-sm px-1 font-mono text-[10px] font-bold text-white"
            :class="tone(item.type)"
            >{{ item.glyph }}</span
          >
          {{ item.label }}
        </Button>
      </template>

      <BlockDiagram
        ref="diagramRef"
        :nodes="diagram.nodes"
        :wires="diagram.wires"
        :readonly="readonly"
        :selected="selected"
        @select="selected = $event"
        @move="state.move"
        @connect="onConnect"
        @delete="onDelete"
      />
      <p class="text-xs text-muted-foreground">
        Drag from a block's ▶ output to a group's input terminal to place it there, or to a block's
        ▼ terminal to make that block conditional. Select a wire or block and press Delete to remove
        it. New blocks go into the selected group. Probe values (yellow) come from the Preview tab.
      </p>
      <ul
        v-if="issueInfo.general.length"
        class="text-sm text-destructive"
        role="alert"
        data-testid="builder-general-issues"
      >
        <li v-for="issue in issueInfo.general" :key="issue.path + issue.code">
          <code>{{ issue.path }}</code
          >: {{ issue.message }}
        </li>
      </ul>

      <template #inspector>
        <ScoringInspector
          v-if="selectedNode !== null"
          :key="selectedNode"
          :def="def"
          :node-key="selectedNode"
          :readonly="readonly"
          :errors="issueInfo.map.get(selectedNode)"
          @apply="onApply"
        />
        <div v-else class="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>Select a block to edit it.</p>
          <ul v-if="issueInfo.map.size" class="flex flex-col gap-1">
            <li v-for="[key, messages] in issueInfo.map" :key="key">
              <button
                type="button"
                class="text-left text-destructive underline"
                @click="selected = key"
              >
                {{ nodeAt(def, key)?.label || key || 'Total' }}: {{ messages[0] }}
              </button>
            </li>
          </ul>
        </div>
      </template>
    </BuilderFrame>
  </div>
</template>
