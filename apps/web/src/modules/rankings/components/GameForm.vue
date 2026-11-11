<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { compileRuleset, evaluate, type ScoreValues } from '@judge26/scoring-engine'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ScoreSheet from '@/modules/scoring/components/ScoreSheet.vue'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type {
  GameRecord,
  GameStatus,
  RoundRecord,
  RulesetRecord,
  TeamRecord,
} from '@/shared/types/records'
import { deleteGame, saveGame } from '../api'
import { secondsToMs } from '../lib'

/**
 * Result form of a team in a round. Created each time the dialog opens, so its
 * state is initialized from props before the first render. With an active
 * ruleset, points come from the score sheet (the server recomputes them).
 */
const props = defineProps<{
  team: TeamRecord
  round: RoundRecord
  games: GameRecord[]
  ruleset?: RulesetRecord
}>()
const emit = defineEmits<{ saved: []; close: [] }>()

const attempts = computed(() =>
  props.games
    .filter((g) => g.team === props.team.id && g.round === props.round.id)
    .sort((a, b) => a.attempt - b.attempt),
)
const selected = ref<string>(attempts.value[0]?.id ?? 'new')
const status = ref<GameStatus>('completed')
const points = ref<number | ''>('')
const seconds = ref('')
const values = ref<ScoreValues>({})
const useSheet = ref(false)

const compiled = computed(() => {
  if (!props.ruleset) return undefined
  try {
    return compileRuleset(props.ruleset.definition)
  } catch {
    return undefined
  }
})
const sheetResult = computed(() =>
  compiled.value ? evaluate(compiled.value, values.value) : undefined,
)
const current = computed(() => attempts.value.find((g) => g.id === selected.value))
const nextAttempt = computed(() => Math.max(0, ...attempts.value.map((g) => g.attempt)) + 1)

function load() {
  const g = current.value
  status.value = g?.status ?? 'completed'
  points.value = g ? g.points : ''
  seconds.value = g && g.time_ms > 0 ? String(g.time_ms / 1000) : ''
  values.value = (g?.values as ScoreValues | null) ?? {}
  useSheet.value = !!compiled.value && (!g || !!g.ruleset)
}

load()
watch(selected, load)

const save = useSubmit(async () => {
  const sheet = status.value === 'completed' && useSheet.value && props.ruleset
  await saveGame(current.value?.id, {
    round: props.round.id,
    team: props.team.id,
    attempt: current.value?.attempt ?? nextAttempt.value,
    status: status.value,
    points: sheet ? 0 : Number(points.value || 0),
    time_ms: status.value === 'completed' ? secondsToMs(seconds.value) : 0,
    ruleset: sheet ? props.ruleset!.id : '',
    values: sheet ? values.value : null,
    // Never silently overwrite a result someone else saved meanwhile (M7-T10).
    ...(current.value ? { expected_updated: current.value.updated } : {}),
  })
  emit('saved')
  emit('close')
})

const remove = useSubmit(async () => {
  if (!current.value || !confirm(`Delete attempt ${current.value.attempt}?`)) return
  await deleteGame(current.value.id)
  emit('saved')
  emit('close')
})

const sheetInvalid = computed(
  () => useSheet.value && status.value === 'completed' && sheetResult.value?.valid === false,
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <form id="game-form" class="flex flex-col gap-4" @submit.prevent="save.run()">
      <ErrorAlert :error="save.error.value ?? remove.error.value" />
      <div class="grid gap-4 sm:grid-cols-3">
        <FormField v-slot="{ id }" label="Attempt" name="attempt">
          <NativeSelect :id="id" v-model="selected" class="w-full">
            <NativeSelectOption v-for="g in attempts" :key="g.id" :value="g.id"
              >Attempt {{ g.attempt }}</NativeSelectOption
            >
            <NativeSelectOption value="new">New attempt ({{ nextAttempt }})</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FormField v-slot="{ id }" label="Result" name="status" :errors="save.fieldErrors.value">
          <NativeSelect :id="id" v-model="status" class="w-full">
            <NativeSelectOption value="completed">Completed</NativeSelectOption>
            <NativeSelectOption value="disqualified">Disqualified</NativeSelectOption>
            <NativeSelectOption value="absent">Absent (did not start)</NativeSelectOption>
            <NativeSelectOption value="scheduled">Scheduled (not played)</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FormField
          v-if="status === 'completed'"
          v-slot="{ id }"
          label="Time (seconds)"
          name="time_ms"
          :errors="save.fieldErrors.value"
          description="Leave empty if not timed."
        >
          <Input :id="id" v-model="seconds" inputmode="decimal" placeholder="e.g. 95.37" />
        </FormField>
      </div>

      <template v-if="status === 'completed'">
        <label v-if="compiled" class="flex items-center gap-2 text-sm">
          <input v-model="useSheet" type="checkbox" class="size-4" />
          Score with ruleset version {{ ruleset?.version }}
        </label>
        <ScoreSheet
          v-if="useSheet && compiled && sheetResult"
          v-model="values"
          :ruleset="compiled"
          :result="sheetResult"
        />
        <FormField
          v-else
          v-slot="{ id }"
          label="Points"
          name="points"
          :errors="save.fieldErrors.value"
        >
          <Input :id="id" v-model.number="points" type="number" step="any" required />
        </FormField>
        <p v-if="save.fieldErrors.value.values" class="text-sm text-destructive" role="alert">
          {{ save.fieldErrors.value.values }}
        </p>
      </template>
    </form>
    <DialogFooter>
      <Button v-if="current" variant="ghost" class="mr-auto" @click="remove.run()"
        >Delete attempt</Button
      >
      <Button variant="outline" @click="emit('close')">Cancel</Button>
      <Button type="submit" form="game-form" :disabled="save.pending.value || sheetInvalid"
        >Save result</Button
      >
    </DialogFooter>
  </div>
</template>
