<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from '@lucide/vue'
import type { Condition, ScoringNode, SelectOption } from '@judge26/scoring-engine'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import InspectorField from '@/shared/diagram/InspectorField.vue'
import {
  defaultClause,
  entries,
  flattenCondition,
  moveNode,
  nodeAt,
  removeNode,
  unflattenCondition,
  updateNode,
  type Clause,
  type Draft,
} from '../builder'

/** Properties of the selected block. Every wiring action of the canvas is available here too. */
const props = defineProps<{ def: Draft; nodeKey: string; readonly?: boolean; errors?: string[] }>()
const emit = defineEmits<{ apply: [def: Draft, key?: string | null] }>()

const node = computed(() => nodeAt(props.def, props.nodeKey))
const isRoot = computed(() => props.nodeKey === '')
const all = computed(() => entries(props.def))
const parent = computed(() => all.value.find((e) => e.key === props.nodeKey)?.parent ?? null)
const index = computed(() => Number(props.nodeKey.split('.').pop()))
const siblings = computed(() => {
  const p = parent.value === null ? undefined : nodeAt(props.def, parent.value)
  return p?.type === 'group' ? p.children.length : 0
})

/** Groups this block can be moved into (not itself or its own blocks). */
const groups = computed(() =>
  all.value.filter(
    (e) =>
      e.node.type === 'group' &&
      e.key !== props.nodeKey &&
      !(props.nodeKey !== '' && e.key.startsWith(`${props.nodeKey}.`)),
  ),
)

function set(patch: Record<string, unknown>) {
  emit('apply', updateNode(props.def, props.nodeKey, patch))
}
function setNested(key: 'selection' | 'clamp', field: 'min' | 'max', value: unknown) {
  const current = {
    ...((node.value as unknown as Record<string, unknown>)[key] as object | undefined),
  } as Record<string, unknown>
  if (value === undefined) delete current[field]
  else current[field] = value
  set({ [key]: Object.keys(current).length ? current : undefined })
}
function move(parentKey: string, at: number) {
  const result = moveNode(props.def, props.nodeKey, parentKey, at)
  if (result) emit('apply', result.def, result.key)
}
function remove() {
  emit('apply', removeNode(props.def, props.nodeKey), null)
}

// Options of a select criterion
function setOption(i: number, patch: Partial<SelectOption>) {
  if (node.value?.type !== 'select') return
  const options = node.value.options.map((o, j) => (j === i ? { ...o, ...patch } : o))
  set({ options })
}
function addOption() {
  if (node.value?.type !== 'select') return
  const ids = new Set(node.value.options.map((o) => o.id))
  let n = node.value.options.length + 1
  while (ids.has(`option${n}`)) n++
  set({ options: [...node.value.options, { id: `option${n}`, label: `Option ${n}`, points: 0 }] })
}
function removeOption(i: number) {
  if (node.value?.type !== 'select') return
  set({ options: node.value.options.filter((_, j) => j !== i) })
}

// Condition
const refs = computed(() =>
  all.value.filter((e) => e.key !== props.nodeKey && e.key !== '' && e.node.id),
)
const refNode = (id: string) => refs.value.find((e) => e.node.id === id)?.node
const flat = computed(() => flattenCondition(node.value?.condition))
const rawCondition = ref('')
const rawError = ref('')
watch(
  () => node.value?.condition,
  (c) => {
    rawCondition.value = c ? JSON.stringify(c, null, 2) : ''
    rawError.value = ''
  },
  { immediate: true },
)

function setClauses(clauses: Clause[], join = flat.value?.join ?? 'all') {
  set({ condition: unflattenCondition({ join, clauses }) })
}
function setClause(i: number, patch: Partial<Clause>) {
  const clauses = flat.value!.clauses.map((c, j) => (j === i ? { ...c, ...patch } : c))
  setClauses(clauses)
}
function changeRef(i: number, id: string) {
  const target = refNode(id)
  if (!target) return
  const fresh = defaultClause(target) as Clause & Condition
  setClause(i, { ref: id, op: fresh.op, value: 'value' in fresh ? fresh.value : undefined })
}
function changeOp(i: number, op: string) {
  const clause = flat.value!.clauses[i]!
  const target = refNode(clause.ref)
  let value: unknown = clause.value
  if (op === 'set' || op === 'unset') value = undefined
  else if (op === 'in') value = Array.isArray(value) ? value : value !== undefined ? [value] : []
  else if (Array.isArray(value)) value = value[0]
  if (value === undefined && op !== 'set' && op !== 'unset' && target) {
    const fresh = defaultClause(target) as Record<string, unknown>
    value = fresh.value
  }
  setClause(i, { op, value })
}
function addClause() {
  const first = refs.value[0]?.node
  if (!first) return
  const fresh = defaultClause(first) as Record<string, unknown>
  setClauses([
    ...(flat.value?.clauses ?? []),
    { negated: false, ref: first.id, op: fresh.op as string, value: fresh.value },
  ])
}
function applyRaw() {
  if (!rawCondition.value.trim()) return set({ condition: undefined })
  try {
    set({ condition: JSON.parse(rawCondition.value) })
  } catch (e) {
    rawError.value = (e as Error).message
  }
}

function opsFor(target: ScoringNode | undefined) {
  const presence = [
    { value: 'set', label: 'is answered' },
    { value: 'unset', label: 'is not answered' },
  ]
  if (!target) return presence
  if (target.type === 'boolean') {
    return [{ value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' }, ...presence]
  }
  if (target.type === 'select') {
    return [
      { value: 'eq', label: 'is' },
      { value: 'neq', label: 'is not' },
      { value: 'in', label: 'is one of' },
      ...presence,
    ]
  }
  return [
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    ...presence,
  ]
}
function toggleIn(i: number, option: string, on: boolean) {
  const current = (flat.value!.clauses[i]!.value as string[] | undefined) ?? []
  setClause(i, { value: on ? [...current, option] : current.filter((v) => v !== option) })
}

const precision = computed(() => props.def.precision as number | undefined)
</script>

<template>
  <div v-if="node" class="flex flex-col gap-4" data-testid="inspector">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {{ isRoot ? 'Total (root group)' : node.type === 'group' ? 'Group' : 'Criterion' }}
        </p>
        <p class="font-semibold">{{ node.label || node.id }}</p>
      </div>
      <Button
        v-if="!isRoot && !readonly"
        variant="ghost"
        size="icon-sm"
        aria-label="Delete block"
        @click="remove"
        ><Trash2Icon
      /></Button>
    </div>

    <ul v-if="errors?.length" class="text-sm text-destructive" role="alert">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <fieldset :disabled="readonly" class="flex flex-col gap-3">
      <InspectorField label="Label" :model-value="node.label" @commit="set({ label: $event })" />
      <InspectorField
        label="Id"
        :model-value="node.id"
        hint="Letters, digits, _ and -. Conditions refer to it."
        @commit="set({ id: $event })"
      />
      <InspectorField
        label="Instructions for judges"
        :model-value="node.description"
        @commit="set({ description: $event || undefined })"
      />

      <!-- Placement: the inspector equivalent of rewiring the output -->
      <div v-if="!isRoot" class="flex flex-col gap-1">
        <label class="text-xs font-medium text-muted-foreground" :for="`parent-${nodeKey}`"
          >Wired into group</label
        >
        <div class="flex gap-1">
          <NativeSelect
            :id="`parent-${nodeKey}`"
            class="min-w-0 flex-1"
            :model-value="parent ?? ''"
            aria-label="Wired into group"
            @update:model-value="move(String($event), Number.MAX_SAFE_INTEGER)"
          >
            <NativeSelectOption v-for="g in groups" :key="g.key" :value="g.key">
              {{ g.key === '' ? 'Total' : g.node.label || g.node.id }}
            </NativeSelectOption>
          </NativeSelect>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Move up"
            :disabled="index === 0"
            @click="move(parent!, index - 1)"
            ><ArrowUpIcon
          /></Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Move down"
            :disabled="index >= siblings - 1"
            @click="move(parent!, index + 2)"
            ><ArrowDownIcon
          /></Button>
        </div>
      </div>

      <label v-if="!isRoot" class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="size-4"
          :checked="node.deduction === true"
          @change="set({ deduction: ($event.target as HTMLInputElement).checked || undefined })"
        />
        Deduction (points are subtracted)
      </label>

      <!-- Type-specific -->
      <template v-if="node.type === 'boolean'">
        <InspectorField
          label="Points if yes"
          type="number"
          :model-value="node.points"
          @commit="set({ points: $event })"
        />
      </template>

      <template v-else-if="node.type === 'number'">
        <div class="grid grid-cols-2 gap-2">
          <InspectorField
            label="Points per unit"
            type="number"
            :model-value="node.pointsPerUnit"
            @commit="set({ pointsPerUnit: $event })"
          />
          <InspectorField
            label="Unit"
            :model-value="node.unit"
            placeholder="e.g. blocks"
            @commit="set({ unit: $event || undefined })"
          />
          <InspectorField
            label="Min"
            type="number"
            :model-value="node.min"
            @commit="set({ min: $event })"
          />
          <InspectorField
            label="Max"
            type="number"
            :model-value="node.max"
            @commit="set({ max: $event })"
          />
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="size-4"
            :checked="node.integer === true"
            @change="set({ integer: ($event.target as HTMLInputElement).checked || undefined })"
          />
          Whole numbers only
        </label>
      </template>

      <template v-else-if="node.type === 'select'">
        <div class="flex flex-col gap-2" data-testid="options">
          <p class="text-xs font-medium text-muted-foreground">Options</p>
          <div
            v-for="(o, i) in node.options"
            :key="i"
            class="grid grid-cols-[1fr_1fr_4.5rem_auto] items-end gap-1"
          >
            <InspectorField
              label="Id"
              :model-value="o.id"
              @commit="setOption(i, { id: String($event) })"
            />
            <InspectorField
              label="Label"
              :model-value="o.label"
              @commit="setOption(i, { label: String($event) })"
            />
            <InspectorField
              label="Points"
              type="number"
              :model-value="o.points"
              @commit="setOption(i, { points: $event as number })"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Remove option ${o.label}`"
              @click="removeOption(i)"
              ><XIcon
            /></Button>
          </div>
          <Button variant="outline" size="sm" class="self-start" @click="addOption"
            ><PlusIcon /> Option</Button
          >
        </div>
      </template>

      <template v-else-if="node.type === 'group'">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground" :for="`agg-${nodeKey}`"
            >Combine children by</label
          >
          <NativeSelect
            :id="`agg-${nodeKey}`"
            :model-value="node.aggregate"
            aria-label="Combine children by"
            @update:model-value="set({ aggregate: $event })"
          >
            <NativeSelectOption value="sum">Sum (Σ)</NativeSelectOption>
            <NativeSelectOption value="max">Highest (MAX)</NativeSelectOption>
            <NativeSelectOption value="min">Lowest (MIN)</NativeSelectOption>
          </NativeSelect>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <InspectorField
            label="Answered children, min"
            type="number"
            :model-value="node.selection?.min"
            @commit="setNested('selection', 'min', $event)"
          />
          <InspectorField
            label="Answered children, max"
            type="number"
            :model-value="node.selection?.max"
            hint="1 = mutually exclusive"
            @commit="setNested('selection', 'max', $event)"
          />
          <InspectorField
            label="Score at least"
            type="number"
            :model-value="node.clamp?.min"
            @commit="setNested('clamp', 'min', $event)"
          />
          <InspectorField
            label="Score at most"
            type="number"
            :model-value="node.clamp?.max"
            @commit="setNested('clamp', 'max', $event)"
          />
        </div>
        <InspectorField
          label="Score when nothing is answered"
          type="number"
          :model-value="node.empty"
          placeholder="0"
          @commit="set({ empty: $event })"
        />
      </template>

      <template v-if="isRoot">
        <InspectorField
          label="Decimal places of all scores (0–4)"
          type="number"
          :model-value="precision"
          placeholder="2"
          @commit="emit('apply', { ...def, precision: $event } as Draft)"
        />
      </template>

      <!-- Condition: the inspector equivalent of the enable terminal -->
      <div v-if="!isRoot" class="flex flex-col gap-2 rounded-md border p-2" data-testid="condition">
        <p class="text-xs font-medium text-muted-foreground">Only counts when</p>
        <template v-if="flat">
          <p v-if="!flat.clauses.length" class="text-sm text-muted-foreground">
            Always. Wire a criterion into the ▼ terminal on top, or add a rule.
          </p>
          <NativeSelect
            v-if="flat.clauses.length > 1"
            :model-value="flat.join"
            aria-label="Combine rules"
            @update:model-value="setClauses(flat.clauses, $event === 'any' ? 'any' : 'all')"
          >
            <NativeSelectOption value="all">all of these hold</NativeSelectOption>
            <NativeSelectOption value="any">any of these holds</NativeSelectOption>
          </NativeSelect>
          <div
            v-for="(c, i) in flat.clauses"
            :key="i"
            class="flex flex-wrap items-center gap-1"
            :data-clause="i"
          >
            <label class="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                :checked="c.negated"
                @change="setClause(i, { negated: ($event.target as HTMLInputElement).checked })"
              />
              not
            </label>
            <NativeSelect
              :model-value="c.ref"
              aria-label="Criterion"
              size="sm"
              @update:model-value="changeRef(i, String($event))"
            >
              <NativeSelectOption v-for="r in refs" :key="r.key" :value="r.node.id">{{
                r.node.label || r.node.id
              }}</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              :model-value="c.op"
              aria-label="Comparison"
              size="sm"
              @update:model-value="changeOp(i, String($event))"
            >
              <NativeSelectOption
                v-for="o in opsFor(refNode(c.ref))"
                :key="o.value"
                :value="o.value"
                >{{ o.label }}</NativeSelectOption
              >
            </NativeSelect>
            <template v-if="c.op !== 'set' && c.op !== 'unset'">
              <NativeSelect
                v-if="refNode(c.ref)?.type === 'boolean'"
                :model-value="String(c.value)"
                aria-label="Value"
                size="sm"
                @update:model-value="setClause(i, { value: $event === 'true' })"
              >
                <NativeSelectOption value="true">yes</NativeSelectOption>
                <NativeSelectOption value="false">no</NativeSelectOption>
              </NativeSelect>
              <template v-else-if="refNode(c.ref)?.type === 'select'">
                <span v-if="c.op === 'in'" class="flex flex-wrap gap-2">
                  <label
                    v-for="o in (refNode(c.ref) as { options: SelectOption[] }).options"
                    :key="o.id"
                    class="flex items-center gap-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      :checked="Array.isArray(c.value) && c.value.includes(o.id)"
                      @change="toggleIn(i, o.id, ($event.target as HTMLInputElement).checked)"
                    />
                    {{ o.label }}
                  </label>
                </span>
                <NativeSelect
                  v-else
                  :model-value="String(c.value)"
                  aria-label="Value"
                  size="sm"
                  @update:model-value="setClause(i, { value: String($event) })"
                >
                  <NativeSelectOption
                    v-for="o in (refNode(c.ref) as { options: SelectOption[] }).options"
                    :key="o.id"
                    :value="o.id"
                    >{{ o.label }}</NativeSelectOption
                  >
                </NativeSelect>
              </template>
              <InspectorField
                v-else
                class="w-20"
                label="Value"
                type="number"
                :model-value="c.value"
                @commit="setClause(i, { value: $event ?? 0 })"
              />
            </template>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove rule"
              @click="setClauses(flat.clauses.filter((_, j) => j !== i))"
              ><XIcon
            /></Button>
          </div>
          <Button
            v-if="refs.length"
            variant="outline"
            size="sm"
            class="self-start"
            @click="addClause"
            ><PlusIcon /> Rule</Button
          >
        </template>
        <template v-else>
          <p class="text-xs text-muted-foreground">
            This condition nests and/or deeper than the form shows. Edit it here as JSON.
          </p>
          <Textarea
            v-model="rawCondition"
            class="min-h-28 font-mono text-xs"
            aria-label="Condition (JSON)"
            spellcheck="false"
            @blur="applyRaw"
          />
          <p v-if="rawError" class="text-xs text-destructive">{{ rawError }}</p>
        </template>
      </div>
    </fieldset>
  </div>
</template>
