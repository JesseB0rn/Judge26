<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from '@lucide/vue'
import type { Aggregation, CalcOp, Operand, SortKey } from '@judge26/ranking-engine'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import InspectorField from '@/shared/diagram/InspectorField.vue'
import {
  connect,
  moveKey,
  moveOperand,
  OPS,
  opPatch,
  refOf,
  removeBlock,
  removeKey,
  removeOperand,
  setPolicy,
  updateCalculation,
  updateKey,
  updateRanking,
  updateRound,
  updateSettings,
  type Draft,
} from '../builder'

/** Properties of the selected block; every wire of the canvas can be made here as well. */
const props = defineProps<{ def: Draft; block: string; readonly?: boolean; errors?: string[] }>()
const emit = defineEmits<{ apply: [def: Draft, select?: string | null] }>()

const kind = computed(() => props.block.split(':')[0] as 'round' | 'calc' | 'ranking')
const index = computed(() => Number(props.block.split(':')[1]))
const round = computed(() => (kind.value === 'round' ? props.def.rounds[index.value] : undefined))
const calc = computed(() =>
  kind.value === 'calc' ? props.def.calculations?.[index.value] : undefined,
)

/** Everything that can be wired: rounds and calculations (not the calculation itself). */
const sources = computed(() => [
  ...props.def.rounds.map((r, i) => ({
    block: `round:${i}`,
    value: `round:${r.key}`,
    label: `${r.label || r.key} (round)`,
  })),
  ...(props.def.calculations ?? [])
    .map((c, i) => ({ block: `calc:${i}`, value: `calc:${c.id}`, label: c.label || c.id }))
    .filter((s) => s.block !== props.block),
])
const operandValue = (o: Operand) => `${'round' in o ? 'round' : 'calc'}:${refOf(o)}`
const sourceBlock = (value: string) => sources.value.find((s) => s.value === value)?.block

function wire(source: string, port: number) {
  const from = sourceBlock(source)
  if (!from) return
  const result = connect(props.def, from, props.block, `in${port}`)
  if (typeof result !== 'string') emit('apply', result)
}

const sortKeys = (agg: Partial<Aggregation> | undefined): SortKey[] =>
  agg?.by ?? [
    { field: 'points', order: 'desc' },
    { field: 'time', order: 'asc' },
  ]

// Round attempts aggregation
function setAttempts(patch: Record<string, unknown> | undefined) {
  if (!round.value) return
  if (patch === undefined)
    return emit('apply', updateRound(props.def, index.value, { attempts: undefined }))
  const attempts = { ...(round.value.attempts ?? { op: 'BEST_BY' }), ...patch } as Record<
    string,
    unknown
  >
  for (const k of Object.keys(attempts)) if (attempts[k] === undefined) delete attempts[k]
  emit('apply', updateRound(props.def, index.value, { attempts }))
}

function setBy(
  target: 'calc' | 'attempts',
  current: Partial<Aggregation> | undefined,
  i: number,
  patch: Partial<SortKey> | null,
) {
  let by = [...sortKeys(current)]
  if (patch === null) by = by.filter((_, j) => j !== i)
  else if (i >= by.length) by.push({ field: 'time', order: 'asc', ...patch })
  else by[i] = { ...by[i]!, ...patch }
  const value = by.length ? by : undefined
  if (target === 'calc') emit('apply', updateCalculation(props.def, index.value, { by: value }))
  else setAttempts({ by: value })
}

const policyOptions = {
  missing: [
    { value: 'zero', label: 'count as 0' },
    { value: 'exclude', label: 'ignore the round' },
    { value: 'unranked', label: 'leave team unranked' },
  ],
  disqualified: [
    { value: 'zero', label: 'count as 0' },
    { value: 'exclude', label: 'ignore the round' },
  ],
  absent: [
    { value: 'zero', label: 'count as 0' },
    { value: 'exclude', label: 'ignore the round' },
  ],
}
const policy = (name: string) =>
  ((props.def.policies as Record<string, string> | undefined) ?? {})[name] ?? 'zero'

const ordered = (op: CalcOp | undefined) =>
  op === 'BEST_BY' || op === 'WORST_BY' || op === 'SUM_BEST_N'
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="inspector">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {{ kind === 'round' ? 'Round' : kind === 'calc' ? 'Calculation' : 'Ranking' }}
        </p>
        <p class="font-semibold">
          {{ round?.label || round?.key || calc?.label || calc?.id || 'Ranking rules' }}
        </p>
      </div>
      <Button
        v-if="kind !== 'ranking' && !readonly"
        variant="ghost"
        size="icon-sm"
        aria-label="Delete block"
        @click="emit('apply', removeBlock(def, block), null)"
        ><Trash2Icon
      /></Button>
    </div>

    <ul v-if="errors?.length" class="text-sm text-destructive" role="alert">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <fieldset :disabled="readonly" class="flex flex-col gap-3">
      <!-- Round -->
      <template v-if="round">
        <InspectorField
          label="Key"
          :model-value="round.key"
          hint="Games reference the round by this key."
          @commit="emit('apply', updateRound(def, index, { key: $event }))"
        />
        <InspectorField
          label="Label"
          :model-value="round.label"
          @commit="emit('apply', updateRound(def, index, { label: $event || undefined }))"
        />
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground" :for="`att-${block}`"
            >Several attempts count as</label
          >
          <NativeSelect
            :id="`att-${block}`"
            :model-value="round.attempts?.op ?? ''"
            aria-label="Several attempts count as"
            @update:model-value="
              $event
                ? setAttempts(opPatch(round.attempts ?? {}, String($event) as CalcOp))
                : setAttempts(undefined)
            "
          >
            <NativeSelectOption value="">Best attempt (default)</NativeSelectOption>
            <NativeSelectOption
              v-for="o in OPS.filter((o) => o.op !== 'DIFFERENCE')"
              :key="o.op"
              :value="o.op"
              >{{ o.label }} – {{ o.hint }}</NativeSelectOption
            >
          </NativeSelect>
        </div>
        <InspectorField
          v-if="round.attempts?.op === 'SUM_BEST_N'"
          label="N (attempts)"
          type="number"
          :model-value="round.attempts.n"
          @commit="setAttempts({ n: $event })"
        />
      </template>

      <!-- Calculation -->
      <template v-if="calc">
        <InspectorField
          label="Label"
          :model-value="calc.label"
          @commit="emit('apply', updateCalculation(def, index, { label: $event }))"
        />
        <InspectorField
          label="Id"
          :model-value="calc.id"
          hint="Other calculations and the ranking refer to it."
          @commit="emit('apply', updateCalculation(def, index, { id: $event }))"
        />
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground" :for="`op-${block}`"
            >Operation</label
          >
          <NativeSelect
            :id="`op-${block}`"
            :model-value="calc.op"
            aria-label="Operation"
            @update:model-value="
              emit('apply', updateCalculation(def, index, opPatch(calc, String($event) as CalcOp)))
            "
          >
            <NativeSelectOption v-for="o in OPS" :key="o.op" :value="o.op"
              >{{ o.label }} – {{ o.hint }}</NativeSelectOption
            >
          </NativeSelect>
        </div>
        <InspectorField
          v-if="calc.op === 'SUM_BEST_N'"
          label="N (results)"
          type="number"
          :model-value="calc.n"
          @commit="emit('apply', updateCalculation(def, index, { n: $event }))"
        />

        <!-- Operands: inspector equivalent of the input wires -->
        <div class="flex flex-col gap-1" data-testid="operands">
          <p class="text-xs font-medium text-muted-foreground">
            {{ calc.op === 'DIFFERENCE' ? 'Operands (a − b)' : 'Inputs, in order' }}
          </p>
          <div v-for="(o, j) in calc.operands" :key="j" class="flex items-center gap-1">
            <NativeSelect
              class="min-w-0 flex-1"
              :model-value="operandValue(o)"
              :aria-label="`Input ${j + 1}`"
              size="sm"
              @update:model-value="wire(String($event), j)"
            >
              <NativeSelectOption v-for="s in sources" :key="s.value" :value="s.value">{{
                s.label
              }}</NativeSelectOption>
            </NativeSelect>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move input up"
              :disabled="j === 0"
              @click="emit('apply', moveOperand(def, index, j, j - 1))"
              ><ArrowUpIcon
            /></Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove input"
              @click="emit('apply', removeOperand(def, index, j))"
              ><XIcon
            /></Button>
          </div>
          <NativeSelect
            v-if="calc.op !== 'DIFFERENCE' || calc.operands.length < 2"
            model-value=""
            aria-label="Add input"
            size="sm"
            @update:model-value="$event && wire(String($event), calc.operands.length)"
          >
            <NativeSelectOption value="">+ Add input…</NativeSelectOption>
            <NativeSelectOption v-for="s in sources" :key="s.value" :value="s.value">{{
              s.label
            }}</NativeSelectOption>
          </NativeSelect>
        </div>
      </template>

      <!-- Sort order of BEST_BY / WORST_BY / SUM_BEST_N (calculation or round attempts) -->
      <div
        v-if="(calc && ordered(calc.op)) || (round?.attempts && ordered(round.attempts.op))"
        class="flex flex-col gap-1"
        data-testid="sort-keys"
      >
        <p class="text-xs font-medium text-muted-foreground">"Best" means, in order</p>
        <div
          v-for="(k, j) in sortKeys(calc ?? round?.attempts)"
          :key="j"
          class="flex items-center gap-1"
        >
          <NativeSelect
            :model-value="k.field"
            aria-label="Field"
            size="sm"
            @update:model-value="
              setBy(calc ? 'calc' : 'attempts', calc ?? round?.attempts, j, {
                field: String($event) as 'points' | 'time',
              })
            "
          >
            <NativeSelectOption value="points">points</NativeSelectOption>
            <NativeSelectOption value="time">time</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            :model-value="k.order"
            aria-label="Order"
            size="sm"
            @update:model-value="
              setBy(calc ? 'calc' : 'attempts', calc ?? round?.attempts, j, {
                order: String($event) as 'asc' | 'desc',
              })
            "
          >
            <NativeSelectOption value="desc">high first</NativeSelectOption>
            <NativeSelectOption value="asc">low first</NativeSelectOption>
          </NativeSelect>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove sort key"
            @click="setBy(calc ? 'calc' : 'attempts', calc ?? round?.attempts, j, null)"
            ><XIcon
          /></Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="self-start"
          @click="
            setBy(calc ? 'calc' : 'attempts', calc ?? round?.attempts, 99, {
              field: 'time',
              order: 'asc',
            })
          "
          ><PlusIcon /> Sort key</Button
        >
      </div>

      <!-- Ranking: keys (tie-breakers), ties, policies, precision -->
      <template v-if="kind === 'ranking'">
        <div class="flex flex-col gap-2" data-testid="ranking-keys">
          <p class="text-xs font-medium text-muted-foreground">
            Rank by (first key decides, the next ones break ties)
          </p>
          <div
            v-for="(k, j) in def.ranking.keys"
            :key="j"
            class="flex flex-col gap-1 rounded-md border p-2"
            :data-key="j"
          >
            <div class="flex items-center gap-1">
              <span class="w-5 text-sm font-semibold tabular-nums">{{ j + 1 }}.</span>
              <NativeSelect
                class="min-w-0 flex-1"
                :model-value="operandValue(k.source)"
                :aria-label="`Key ${j + 1} source`"
                size="sm"
                @update:model-value="wire(String($event), j)"
              >
                <NativeSelectOption v-for="s in sources" :key="s.value" :value="s.value">{{
                  s.label
                }}</NativeSelectOption>
              </NativeSelect>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move key up"
                :disabled="j === 0"
                @click="emit('apply', moveKey(def, j, j - 1))"
                ><ArrowUpIcon
              /></Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move key down"
                :disabled="j === def.ranking.keys.length - 1"
                @click="emit('apply', moveKey(def, j, j + 1))"
                ><ArrowDownIcon
              /></Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove key"
                @click="emit('apply', removeKey(def, j))"
                ><XIcon
              /></Button>
            </div>
            <div class="grid grid-cols-2 gap-1 pl-6">
              <NativeSelect
                :model-value="k.field"
                aria-label="Field"
                size="sm"
                @update:model-value="emit('apply', updateKey(def, j, { field: $event }))"
              >
                <NativeSelectOption value="points">points</NativeSelectOption>
                <NativeSelectOption value="time">time</NativeSelectOption>
              </NativeSelect>
              <NativeSelect
                :model-value="k.order"
                aria-label="Order"
                size="sm"
                @update:model-value="emit('apply', updateKey(def, j, { order: $event }))"
              >
                <NativeSelectOption value="desc">high first</NativeSelectOption>
                <NativeSelectOption value="asc">low first</NativeSelectOption>
              </NativeSelect>
              <InspectorField
                class="col-span-2"
                label="Column label"
                :model-value="k.label"
                @commit="emit('apply', updateKey(def, j, { label: $event || undefined }))"
              />
            </div>
          </div>
          <NativeSelect
            model-value=""
            aria-label="Add ranking key"
            size="sm"
            @update:model-value="$event && wire(String($event), def.ranking.keys.length)"
          >
            <NativeSelectOption value="">
              {{ def.ranking.keys.length ? '+ Add tie-breaker…' : '+ Add ranking key…' }}
            </NativeSelectOption>
            <NativeSelectOption v-for="s in sources" :key="s.value" :value="s.value">{{
              s.label
            }}</NativeSelectOption>
          </NativeSelect>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground" for="ranking-ties"
            >When all keys are equal</label
          >
          <NativeSelect
            id="ranking-ties"
            :model-value="def.ranking.ties ?? 'shared'"
            aria-label="When all keys are equal"
            @update:model-value="emit('apply', updateRanking(def, { ties: $event }))"
          >
            <NativeSelectOption value="shared">shared rank</NativeSelectOption>
            <NativeSelectOption value="name">order by team name</NativeSelectOption>
          </NativeSelect>
        </div>

        <div class="flex flex-col gap-2" data-testid="policies">
          <p class="text-xs font-medium text-muted-foreground">Results that are…</p>
          <div
            v-for="(options, name) in policyOptions"
            :key="name"
            class="flex items-center justify-between gap-2 text-sm"
          >
            <span>{{ name }}</span>
            <NativeSelect
              :model-value="policy(name)"
              :aria-label="`Policy ${name}`"
              size="sm"
              @update:model-value="emit('apply', setPolicy(def, name, String($event)))"
            >
              <NativeSelectOption v-for="o in options" :key="o.value" :value="o.value">{{
                o.label
              }}</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <InspectorField
            label="Decimal places (0–4)"
            type="number"
            :model-value="def.precision"
            placeholder="2"
            @commit="emit('apply', updateSettings(def, { precision: $event }))"
          />
          <InspectorField
            label="Time resolution (ms)"
            type="number"
            :model-value="def.timeResolutionMs"
            placeholder="1"
            @commit="emit('apply', updateSettings(def, { timeResolutionMs: $event }))"
          />
        </div>
      </template>
    </fieldset>
  </div>
</template>
