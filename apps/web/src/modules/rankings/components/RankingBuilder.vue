<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { toast } from 'vue-sonner'
import type { CalcOp, Ranking } from '@judge26/ranking-engine'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import BlockDiagram from '@/shared/diagram/BlockDiagram.vue'
import BuilderFrame from '@/shared/diagram/BuilderFrame.vue'
import { useBuilderState } from '@/shared/diagram/useBuilderState'
import { parseRankingConfig } from '../lib'
import {
  addCalculation,
  addRound,
  connect,
  disconnect,
  isBuildable,
  issuesByBlock,
  OPS,
  removeBlock,
  toDiagram,
  type Draft,
} from '../builder'
import RankingInspector from './RankingInspector.vue'

/**
 * Visual aggregation builder (M3-18), LabVIEW style: rounds are controls on the left,
 * calculations are function blocks, the ranking is the indicator on the right whose terminals
 * are the ranking keys in tie-break order. Wires carry whole results (points with their time).
 * Edits the same JSON text as the configuration editor, with the same validation; probes show
 * the live calculation of one team (M3-16).
 */
const props = defineProps<{ readonly?: boolean; ranking?: Ranking }>()
const text = defineModel<string>({ required: true })
const state = useBuilderState(text)
const { selected, positions, history } = state
const diagramRef = ref<InstanceType<typeof BlockDiagram>>()
const probeTeam = ref('')

const parsed = computed(() => parseRankingConfig(text.value))
const def = computed(() => (isBuildable(parsed.value.definition) ? parsed.value.definition : null))
const probe = computed(() =>
  parsed.value.config ? props.ranking?.entries.find((e) => e.team === probeTeam.value) : undefined,
)

const diagram = computed(() =>
  def.value
    ? toDiagram(def.value, {
        issues: parsed.value.issues,
        probe: probe.value,
        positions: positions.value,
      })
    : { nodes: [], wires: [] },
)
const issueInfo = computed(() =>
  def.value ? issuesByBlock(def.value, parsed.value.issues) : { map: new Map(), general: [] },
)
const selectedBlock = computed(() => {
  const id = selected.value
  if (!def.value || !id || id.startsWith('wire:')) return null
  return diagram.value.nodes.some((n) => n.id === id) ? id : null
})

function onApply(next: Draft, select?: string | null) {
  state.apply(next, { select })
}

function add(kind: 'round' | CalcOp) {
  if (!def.value || props.readonly) return
  const result = kind === 'round' ? addRound(def.value) : addCalculation(def.value, kind)
  state.apply(result.def, { select: result.key })
}

function onConnect(from: string, to: string, port: string) {
  if (!def.value || props.readonly) return
  if (port === 'enable') return
  const result = connect(def.value, from, to, port)
  if (typeof result === 'string') toast.error(result)
  else state.apply(result, { select: to })
}

function onDelete(id: string) {
  if (!def.value || props.readonly) return
  if (id.startsWith('wire:')) state.apply(disconnect(def.value, id.slice(5)), { select: null })
  else if (id !== 'ranking') state.apply(removeBlock(def.value, id), { select: null })
}

async function tidy() {
  positions.value = new Map()
  await nextTick()
  diagramRef.value?.fit()
}

const blockName = (id: string) => diagram.value.nodes.find((n) => n.id === id)?.title ?? id
</script>

<template>
  <div data-testid="ranking-builder" @keydown="state.onKeydown($event, readonly)">
    <p v-if="!text.trim()" class="text-sm text-muted-foreground">
      No ranking configuration yet. Use "Generate from rounds" or "Load example" to start.
    </p>
    <p v-else-if="parsed.syntaxError" class="text-sm text-destructive" role="alert">
      The JSON has a syntax error ({{ parsed.syntaxError }}). Fix it in the JSON editor first.
    </p>
    <p v-else-if="!def" class="text-sm text-destructive" role="alert">
      The configuration needs a rounds list and ranking keys before the builder can show it. Fix it
      in the JSON editor first.
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
        <Button variant="outline" size="sm" aria-label="Add Round" @click="add('round')">
          <span class="rounded-sm bg-[#8b5a2b] px-1 font-mono text-[10px] font-bold text-white"
            >R</span
          >
          Round
        </Button>
        <Button
          v-for="o in OPS"
          :key="o.op"
          variant="outline"
          size="sm"
          :aria-label="`Add ${o.label}`"
          :title="o.hint"
          @click="add(o.op)"
        >
          <span class="rounded-sm bg-[#8b5a2b] px-1 font-mono text-[10px] font-bold text-white">{{
            o.glyph
          }}</span>
          {{ o.label }}
        </Button>
      </template>

      <div v-if="ranking?.entries.length && parsed.config" class="flex items-center gap-2 text-sm">
        <label for="probe-team" class="text-muted-foreground">Probe team</label>
        <NativeSelect id="probe-team" v-model="probeTeam" size="sm" aria-label="Probe team">
          <NativeSelectOption value="">None</NativeSelectOption>
          <NativeSelectOption v-for="e in ranking.entries" :key="e.team" :value="e.team">
            {{ e.rank ?? '–' }}. {{ e.name }}
          </NativeSelectOption>
        </NativeSelect>
      </div>
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
        Drag from a block's ▶ output to an input terminal of a calculation, or to the ranking to add
        a ranking key (the first key ranks, the next ones break ties). Select a wire or block and
        press Delete to remove it. Choose a probe team to see its results on every wire.
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
        <RankingInspector
          v-if="selectedBlock"
          :key="selectedBlock"
          :def="def"
          :block="selectedBlock"
          :readonly="readonly"
          :errors="issueInfo.map.get(selectedBlock)"
          @apply="onApply"
        />
        <div v-else class="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>Select a block to edit it. The ranking block holds tie-breaks and policies.</p>
          <Button variant="outline" size="sm" class="self-start" @click="selected = 'ranking'"
            >Ranking rules</Button
          >
          <ul v-if="issueInfo.map.size" class="flex flex-col gap-1">
            <li v-for="[id, messages] in issueInfo.map" :key="id">
              <button
                type="button"
                class="text-left text-destructive underline"
                @click="selected = id"
              >
                {{ blockName(id) }}: {{ messages[0] }}
              </button>
            </li>
          </ul>
        </div>
      </template>
    </BuilderFrame>
  </div>
</template>
