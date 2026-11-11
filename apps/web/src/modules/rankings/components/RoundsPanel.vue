<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { PencilIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import type { CompetitionDayRecord, GameRuleRecord, RoundRecord } from '@/shared/types/records'
import { gameRuleIdForRound } from '@/modules/scoring/lib'
import { createRound, deleteRound, updateRound } from '../api'

/** Rounds of a category (M3-01). Keys are referenced by the ranking configuration. */
const props = defineProps<{
  categoryId: string
  rounds: RoundRecord[]
  /** Competition days of the event; a round can be assigned to one (M5-02). */
  days?: CompetitionDayRecord[]
  /** Games of the category; each round is scored with the ruleset of one game. */
  gameRules?: GameRuleRecord[]
  editable: boolean
  /** Round to open for editing once known (deep link from the planner). */
  editRound?: string
}>()
const emit = defineEmits<{ changed: [] }>()

const form = reactive({
  key: '',
  name: '',
  testing_minutes: 0,
  scoring_minutes: 15,
  day: '',
  game_rule: '',
})
const rules = () => props.gameRules ?? []
const gameLabel = (round: RoundRecord) =>
  rules().find((r) => r.id === gameRuleIdForRound(round, rules()))?.name ?? 'Not set'
/** A new round plays the game of the previous round (or the only game). */
const defaultGame = () =>
  props.rounds[props.rounds.length - 1]?.game_rule || (rules().length ? rules()[0]!.id : '')
const dayLabel = (id: string | undefined) => {
  const day = props.days?.find((d) => d.id === id)
  return day ? day.label || formatDay(day.date) : '–'
}
const editingId = ref<string>()
// Preselect a game once the games are known.
watch(
  () => props.gameRules,
  () => {
    if (!editingId.value && !rules().some((r) => r.id === form.game_rule))
      form.game_rule = defaultGame()
  },
  { immediate: true },
)

const add = useSubmit(async () => {
  const data = {
    key: form.key,
    name: form.name,
    position: Math.max(0, ...props.rounds.map((r) => r.position)) + 1,
    testing_minutes: form.testing_minutes,
    scoring_minutes: form.scoring_minutes,
    ...(props.days?.length ? { day: form.day } : {}),
    ...(rules().length ? { game_rule: form.game_rule } : {}),
  }
  if (editingId.value) {
    const round = props.rounds.find((item) => item.id === editingId.value)
    if (!round) throw new Error('The round being edited no longer exists.')
    await updateRound(round.id, { ...data, position: round.position })
  } else {
    await createRound(props.categoryId, data)
  }
  resetForm()
  emit('changed')
})

function resetForm() {
  editingId.value = undefined
  form.key = ''
  form.name = ''
  form.testing_minutes = 0
  form.scoring_minutes = 15
  form.day = ''
  form.game_rule = defaultGame()
}

function edit(round: RoundRecord) {
  editingId.value = round.id
  form.key = round.key
  form.name = round.name
  form.testing_minutes = round.testing_minutes
  form.scoring_minutes = round.scoring_minutes
  form.day = round.day ?? ''
  form.game_rule = gameRuleIdForRound(round, rules())
  add.reset()
}

// Open the linked round once, as soon as it is loaded.
let openedLink = ''
watch(
  () => [props.editRound, props.rounds] as const,
  ([id, rounds]) => {
    if (!id || openedLink === id || !props.editable) return
    const round = rounds.find((r) => r.id === id)
    if (!round) return
    openedLink = id
    edit(round)
  },
  { immediate: true },
)

const remove = useSubmit(async (round: RoundRecord) => {
  if (!confirm(`Delete ${round.name}? All results recorded in this round are deleted too.`)) return
  await deleteRound(round.id)
  emit('changed')
})
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <div class="flex flex-col gap-2">
      <ErrorAlert :error="remove.error.value" />
      <Table data-testid="rounds">
        <TableHeader>
          <TableRow>
            <TableHead class="w-16">#</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Name</TableHead>
            <TableHead v-if="gameRules?.length">Game</TableHead>
            <TableHead v-if="days?.length">Day</TableHead>
            <TableHead>Phases</TableHead>
            <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(round, i) in rounds" :key="round.id">
            <TableCell>{{ i + 1 }}</TableCell>
            <TableCell class="font-mono">{{ round.key }}</TableCell>
            <TableCell>{{ round.name }}</TableCell>
            <TableCell v-if="gameRules?.length" class="text-sm" data-testid="round-game">{{
              gameLabel(round)
            }}</TableCell>
            <TableCell v-if="days?.length" class="text-sm">{{ dayLabel(round.day) }}</TableCell>
            <TableCell class="text-sm">
              Testing {{ round.testing_minutes }}m · Scoring {{ round.scoring_minutes }}m · Total
              {{ round.testing_minutes + round.scoring_minutes }}m
            </TableCell>
            <TableCell>
              <Button
                v-if="editable"
                variant="ghost"
                size="icon-sm"
                :aria-label="`Edit ${round.name}`"
                @click="edit(round)"
              >
                <PencilIcon />
              </Button>
              <Button
                v-if="editable"
                variant="ghost"
                size="icon-sm"
                :aria-label="`Delete ${round.name}`"
                @click="remove.run(round)"
              >
                <Trash2Icon />
              </Button>
            </TableCell>
          </TableRow>
          <TableEmpty
            v-if="!rounds.length"
            :colspan="5 + (days?.length ? 1 : 0) + (gameRules?.length ? 1 : 0)"
            >No rounds yet.</TableEmpty
          >
        </TableBody>
      </Table>
    </div>
    <form v-if="editable" class="flex flex-col gap-3" @submit.prevent="add.run()">
      <ErrorAlert :error="add.error.value" />
      <FormField
        v-slot="{ id }"
        label="Key"
        name="key"
        :errors="add.fieldErrors.value"
        description="Used in the ranking configuration, e.g. R1."
      >
        <Input :id="id" v-model="form.key" required pattern="[A-Za-z][A-Za-z0-9_\-]*" />
      </FormField>
      <FormField v-slot="{ id }" label="Round name" name="name" :errors="add.fieldErrors.value">
        <Input :id="id" v-model="form.name" required />
      </FormField>
      <FormField
        v-if="gameRules?.length"
        v-slot="{ id }"
        label="Game"
        name="game_rule"
        :errors="add.fieldErrors.value"
        description="The score sheet judges use in this round."
      >
        <NativeSelect :id="id" v-model="form.game_rule" class="w-full" required>
          <NativeSelectOption v-for="r in gameRules" :key="r.id" :value="r.id">{{
            r.name
          }}</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FormField
        v-if="days?.length"
        v-slot="{ id }"
        label="Competition day"
        name="day"
        :errors="add.fieldErrors.value"
        description="Judges filter their games by day."
      >
        <NativeSelect :id="id" v-model="form.day" class="w-full">
          <NativeSelectOption value="">No day</NativeSelectOption>
          <NativeSelectOption v-for="d in days" :key="d.id" :value="d.id">{{
            d.label ? `${d.label} (${formatDay(d.date)})` : formatDay(d.date)
          }}</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FormField
        v-slot="{ id }"
        label="Maintenance / testing (minutes)"
        name="testing_minutes"
        :errors="add.fieldErrors.value"
      >
        <Input
          :id="id"
          v-model.number="form.testing_minutes"
          type="number"
          min="0"
          step="1"
          required
        />
      </FormField>
      <FormField
        v-slot="{ id }"
        label="Scoring phase (minutes)"
        name="scoring_minutes"
        :errors="add.fieldErrors.value"
      >
        <Input
          :id="id"
          v-model.number="form.scoring_minutes"
          type="number"
          min="1"
          step="1"
          required
        />
      </FormField>
      <p class="text-sm text-muted-foreground">
        Total round duration: {{ form.testing_minutes + form.scoring_minutes }} minutes.
      </p>
      <div class="flex gap-2">
        <Button type="submit" :disabled="add.pending.value">
          {{ editingId ? 'Save round' : 'Add round' }}
        </Button>
        <Button v-if="editingId" type="button" variant="outline" @click="resetForm">Cancel</Button>
      </div>
    </form>
  </div>
</template>
