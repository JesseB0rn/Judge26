<script setup lang="ts">
import { t } from '@/i18n'
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { AppError, toAppError } from '@/shared/api/errors'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import type { CompetitionDayRecord, GameRuleRecord, RoundRecord } from '@/shared/types/records'
import { gameRuleIdForRound } from '@/modules/scoring/lib'
import {
  createRound,
  deleteRound,
  getScoringPhase,
  timeRound,
  updateRound,
  type ScoringPhaseVersion,
} from '../api'

/**
 * The form of one round (M3-01), shared by the Rounds tab of the category page and the round
 * dialog of the categories grid (M11-02), so the two cannot drift apart. Without `round` it
 * adds a round after the category's last one. M11-05: an optional start time times the round.
 */
const props = defineProps<{
  categoryId: string
  /** The category's rounds: the position and default game of a new round come from them. */
  rounds: RoundRecord[]
  /** The round being edited; none adds a round. */
  round?: RoundRecord
  /** Competition days of the event; a round can be assigned to one (M5-02). */
  days?: CompetitionDayRecord[]
  /** Games of the category; each round is scored with the ruleset of one game. */
  gameRules?: GameRuleRecord[]
  /** The category's event; M11-07: without days the form links to its Overview tab. */
  eventId?: string
  /** Show Cancel also when adding (in a dialog). */
  cancelable?: boolean
  /** Offer Delete while editing (the grid dialog; the Rounds tab deletes from its table). */
  deletable?: boolean
}>()
const emit = defineEmits<{
  saved: [round: RoundRecord]
  /** The round was saved but its start time was not; the form stays open on it. */
  changed: [round: RoundRecord]
  deleted: []
  cancel: []
}>()

const CHECK_MODES = ['synchronous', 'asynchronous', 'off'] as const
const DAY_START = '08:00'
const DAY_END = '18:00'
const rules = () => props.gameRules ?? []
/** A new round plays the game of the previous round (or the only game). */
const defaultGame = () =>
  props.rounds[props.rounds.length - 1]?.game_rule || (rules().length ? rules()[0]!.id : '')

/** The round being edited: the given one, or a new one saved while its time was not. */
const current = ref<RoundRecord>()
/** Its scoring phase as read when the form opened (M11-05). */
const read = ref<ScoringPhaseVersion>()

const form = reactive({
  key: '',
  name: '',
  testing_minutes: 0,
  scoring_minutes: 15,
  day: '',
  starts_at: '',
  game_rule: '',
  // M10-08: new rounds have a synchronous robot check.
  check_mode: 'synchronous' as NonNullable<RoundRecord['check_mode']>,
})
const chosenDay = computed(() => props.days?.find((d) => d.id === form.day))

function fill(round: RoundRecord | undefined) {
  form.key = round?.key ?? ''
  form.name = round?.name ?? ''
  form.testing_minutes = round?.testing_minutes ?? 0
  form.scoring_minutes = round?.scoring_minutes ?? 15
  form.day = round?.day ?? ''
  form.starts_at = ''
  form.game_rule = round ? gameRuleIdForRound(round, rules()) : defaultGame()
  form.check_mode = round ? (round.check_mode ?? 'off') : 'synchronous'
}

/** Shows the current start of an edited round. */
async function readPhase(roundId: string) {
  try {
    read.value = await getScoringPhase(roundId)
  } catch {
    read.value = undefined
  }
  if (current.value?.id === roundId) form.starts_at = read.value?.day ? read.value.starts_at : ''
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** M11-05: the scoring run must fit the day's hours, as in the planner. */
function checkWindow() {
  const day = chosenDay.value
  if (!day || !form.starts_at) return
  const start = toMinutes(form.starts_at)
  const end = start + (form.scoring_minutes || 1)
  if (start < toMinutes(day.starts_at || DAY_START) || end > toMinutes(day.ends_at || DAY_END)) {
    const message = t('planner.issues.outside_day')
    throw new AppError('validation', message, { fieldErrors: { starts_at: message } })
  }
}

/** Places the scoring phase; reports a failure as "round saved, start not". */
async function saveTime(round: RoundRecord) {
  const before = read.value?.day ? read.value.starts_at : ''
  const startsAt = form.day ? form.starts_at : ''
  if (startsAt === before) return
  try {
    checkWindow()
    await timeRound(round.id, startsAt, read.value && { starts_at: read.value.starts_at })
  } catch (e) {
    const error = toAppError(e)
    const reason = Object.values(error.fieldErrors)[0] ?? error.message
    current.value = round
    emit('changed', round)
    void readPhase(round.id).then(() => (form.starts_at = startsAt))
    throw new AppError(error.kind, t('rankings.rounds.timeNotSaved', { reason }), {
      status: error.status,
      fieldErrors: { starts_at: reason },
      cause: e,
    })
  }
}

const save = useSubmit(async () => {
  const editing = current.value
  const data = {
    key: form.key,
    name: form.name,
    position: editing?.position ?? Math.max(0, ...props.rounds.map((r) => r.position)) + 1,
    testing_minutes: form.testing_minutes,
    scoring_minutes: form.scoring_minutes,
    ...(props.days?.length ? { day: form.day } : {}),
    ...(rules().length ? { game_rule: form.game_rule } : {}),
    check_mode: form.check_mode,
  }
  const saved = editing
    ? await updateRound(editing.id, data)
    : await createRound(props.categoryId, data)
  await saveTime(saved)
  if (!props.round) {
    current.value = undefined
    read.value = undefined
    fill(undefined)
  }
  emit('saved', saved)
})

const remove = useSubmit(async () => {
  const round = current.value
  if (!round) return
  if (!confirm(t('rankings.rounds.confirmDelete', { round: round.name }))) return
  await deleteRound(round.id)
  emit('deleted')
})

// A different round (or none) refills the form.
watch(
  () => props.round?.id,
  (id) => {
    // A round saved here while its time was not is already on the form (with the error).
    if (id && id === current.value?.id) {
      current.value = props.round
      return
    }
    current.value = props.round
    read.value = undefined
    fill(props.round)
    save.reset()
    remove.reset()
    if (props.round) void readPhase(props.round.id)
  },
  { immediate: true },
)
// Preselect a game once the games are known.
watch(
  () => props.gameRules,
  () => {
    if (!current.value && !rules().some((r) => r.id === form.game_rule))
      form.game_rule = defaultGame()
  },
)

function cancel() {
  current.value = props.round
  fill(props.round)
  if (props.round) void readPhase(props.round.id)
  save.reset()
  emit('cancel')
}
</script>

<template>
  <form class="flex flex-col gap-3" data-testid="round-form" @submit.prevent="save.run()">
    <ErrorAlert :error="save.error.value ?? remove.error.value" />
    <Alert v-if="eventId && days && !days.length" data-testid="round-no-days">
      <AlertDescription>
        {{ t('rankings.rounds.noDays') }}
        <RouterLink
          class="underline"
          :to="{ name: 'event', params: { id: eventId }, query: { tab: 'overview' } }"
          >{{ t('rankings.rounds.noDaysLink') }}</RouterLink
        >
      </AlertDescription>
    </Alert>
    <FormField
      v-slot="{ id }"
      :label="t('rankings.rounds.key')"
      name="key"
      :errors="save.fieldErrors.value"
      :description="t('rankings.rounds.keyHint')"
    >
      <Input :id="id" v-model="form.key" required pattern="[A-Za-z][A-Za-z0-9_\-]*" />
    </FormField>
    <FormField
      v-slot="{ id }"
      :label="t('rankings.rounds.name')"
      name="name"
      :errors="save.fieldErrors.value"
    >
      <Input :id="id" v-model="form.name" required />
    </FormField>
    <FormField
      v-if="gameRules?.length"
      v-slot="{ id }"
      :label="t('rankings.rounds.game')"
      name="game_rule"
      :errors="save.fieldErrors.value"
      :description="t('rankings.rounds.gameHint')"
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
      :label="t('rankings.rounds.day')"
      name="day"
      :errors="save.fieldErrors.value"
      :description="t('rankings.rounds.dayHint')"
    >
      <NativeSelect :id="id" v-model="form.day" class="w-full">
        <NativeSelectOption value="">{{ t('judging.noDay') }}</NativeSelectOption>
        <NativeSelectOption v-for="d in days" :key="d.id" :value="d.id">{{
          d.label ? `${d.label} (${formatDay(d.date)})` : formatDay(d.date)
        }}</NativeSelectOption>
      </NativeSelect>
    </FormField>
    <FormField
      v-if="days?.length && form.day"
      v-slot="{ id }"
      :label="t('rankings.rounds.startsAt')"
      name="starts_at"
      :errors="save.fieldErrors.value"
      :description="
        t('rankings.rounds.startsAtHint', {
          from: chosenDay?.starts_at || DAY_START,
          to: chosenDay?.ends_at || DAY_END,
        })
      "
    >
      <Input :id="id" v-model="form.starts_at" type="time" data-testid="round-starts-at" />
    </FormField>
    <FormField
      v-slot="{ id }"
      :label="t('rankings.rounds.testing')"
      name="testing_minutes"
      :errors="save.fieldErrors.value"
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
      :label="t('rankings.rounds.scoring')"
      name="scoring_minutes"
      :errors="save.fieldErrors.value"
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
    <FormField
      v-slot="{ id }"
      :label="t('checks.mode.label')"
      name="check_mode"
      :errors="save.fieldErrors.value"
      :description="t('checks.mode.hint')"
    >
      <NativeSelect
        :id="id"
        v-model="form.check_mode"
        class="w-full"
        data-testid="round-check-mode"
      >
        <NativeSelectOption v-for="mode in CHECK_MODES" :key="mode" :value="mode">{{
          t(`checks.mode.${mode}`)
        }}</NativeSelectOption>
      </NativeSelect>
    </FormField>
    <p class="text-sm text-muted-foreground">
      {{ t('rankings.rounds.total', { minutes: form.testing_minutes + form.scoring_minutes }) }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="save.pending.value">
        {{ current ? t('rankings.rounds.save') : t('rankings.rounds.add') }}
      </Button>
      <Button v-if="current || cancelable" type="button" variant="outline" @click="cancel">{{
        t('common.cancel')
      }}</Button>
      <Button
        v-if="current && deletable"
        type="button"
        variant="destructive"
        class="sm:ml-auto"
        :disabled="remove.pending.value"
        data-testid="round-delete"
        @click="remove.run()"
        >{{ t('common.delete') }}</Button
      >
    </div>
  </form>
</template>
