<script setup lang="ts">
import { t } from '@/i18n'
import { reactive, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import type { CompetitionDayRecord, GameRuleRecord, RoundRecord } from '@/shared/types/records'
import { gameRuleIdForRound } from '@/modules/scoring/lib'
import { createRound, deleteRound, updateRound } from '../api'

/**
 * The form of one round (M3-01), shared by the Rounds tab of the category page and the round
 * dialog of the categories grid (M11-02), so the two cannot drift apart. Without `round` it
 * adds a round after the category's last one.
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
  /** Element id of the form, for a submit button outside it. */
  formId?: string
}>()
const emit = defineEmits<{ saved: [round: RoundRecord]; deleted: []; cancel: [] }>()

const CHECK_MODES = ['synchronous', 'asynchronous', 'off'] as const
const rules = () => props.gameRules ?? []
/** A new round plays the game of the previous round (or the only game). */
const defaultGame = () =>
  props.rounds[props.rounds.length - 1]?.game_rule || (rules().length ? rules()[0]!.id : '')

const form = reactive({
  key: '',
  name: '',
  testing_minutes: 0,
  scoring_minutes: 15,
  day: '',
  game_rule: '',
  // M10-08: new rounds have a synchronous robot check.
  check_mode: 'synchronous' as NonNullable<RoundRecord['check_mode']>,
})

function fill(round: RoundRecord | undefined) {
  form.key = round?.key ?? ''
  form.name = round?.name ?? ''
  form.testing_minutes = round?.testing_minutes ?? 0
  form.scoring_minutes = round?.scoring_minutes ?? 15
  form.day = round?.day ?? ''
  form.game_rule = round ? gameRuleIdForRound(round, rules()) : defaultGame()
  form.check_mode = round ? (round.check_mode ?? 'off') : 'synchronous'
}

const save = useSubmit(async () => {
  const data = {
    key: form.key,
    name: form.name,
    position: props.round?.position ?? Math.max(0, ...props.rounds.map((r) => r.position)) + 1,
    testing_minutes: form.testing_minutes,
    scoring_minutes: form.scoring_minutes,
    ...(props.days?.length ? { day: form.day } : {}),
    ...(rules().length ? { game_rule: form.game_rule } : {}),
    check_mode: form.check_mode,
  }
  const saved = props.round
    ? await updateRound(props.round.id, data)
    : await createRound(props.categoryId, data)
  if (!props.round) fill(undefined)
  emit('saved', saved)
})

const remove = useSubmit(async () => {
  const round = props.round
  if (!round) return
  if (!confirm(t('rankings.rounds.confirmDelete', { round: round.name }))) return
  await deleteRound(round.id)
  emit('deleted')
})

// A different round (or none) refills the form.
watch(
  () => props.round?.id,
  () => {
    fill(props.round)
    save.reset()
    remove.reset()
  },
  { immediate: true },
)
// Preselect a game once the games are known.
watch(
  () => props.gameRules,
  () => {
    if (!props.round && !rules().some((r) => r.id === form.game_rule))
      form.game_rule = defaultGame()
  },
)

function cancel() {
  fill(props.round)
  save.reset()
  emit('cancel')
}
</script>

<template>
  <form
    :id="formId"
    class="flex flex-col gap-3"
    data-testid="round-form"
    @submit.prevent="save.run()"
  >
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
        {{ round ? t('rankings.rounds.save') : t('rankings.rounds.add') }}
      </Button>
      <Button v-if="round || cancelable" type="button" variant="outline" @click="cancel">{{
        t('common.cancel')
      }}</Button>
      <Button
        v-if="round && deletable"
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
