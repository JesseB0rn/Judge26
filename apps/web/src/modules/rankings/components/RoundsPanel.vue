<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { PencilIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
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
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import type { CompetitionDayRecord, GameRuleRecord, RoundRecord } from '@/shared/types/records'
import { gameRuleIdForRound } from '@/modules/scoring/lib'
import { deleteRound } from '../api'
import RoundForm from './RoundForm.vue'

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
  /** The category's event; M11-07: without days the form links to its Overview tab. */
  eventId?: string
}>()
const emit = defineEmits<{ changed: [] }>()

const rules = () => props.gameRules ?? []
const gameLabel = (round: RoundRecord) =>
  rules().find((r) => r.id === gameRuleIdForRound(round, rules()))?.name ??
  t('rankings.rounds.notSet')
const dayLabel = (id: string | undefined) => {
  const day = props.days?.find((d) => d.id === id)
  return day ? day.label || formatDay(day.date) : '–'
}
const editingId = ref<string>()
const editing = computed(() => props.rounds.find((r) => r.id === editingId.value))

function edit(round: RoundRecord) {
  editingId.value = round.id
}

function onSaved() {
  editingId.value = undefined
  emit('changed')
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
  if (!confirm(t('rankings.rounds.confirmDelete', { round: round.name }))) return
  await deleteRound(round.id)
  if (editingId.value === round.id) editingId.value = undefined
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
            <TableHead>{{ t('rankings.rounds.key') }}</TableHead>
            <TableHead>{{ t('common.name') }}</TableHead>
            <TableHead v-if="gameRules?.length">{{ t('rankings.rounds.game') }}</TableHead>
            <TableHead v-if="days?.length">{{ t('scheduling.export.day') }}</TableHead>
            <TableHead>{{ t('rankings.rounds.phases') }}</TableHead>
            <TableHead class="w-0"
              ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
            >
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
              <span class="block text-muted-foreground" data-testid="round-check">{{
                t(`checks.mode.${round.check_mode ?? 'off'}`)
              }}</span>
              {{
                t('rankings.rounds.phaseSummary', {
                  testing: round.testing_minutes,
                  scoring: round.scoring_minutes,
                  total: round.testing_minutes + round.scoring_minutes,
                })
              }}
            </TableCell>
            <TableCell>
              <Button
                v-if="editable"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('common.editItem', { item: round.name })"
                @click="edit(round)"
              >
                <PencilIcon />
              </Button>
              <Button
                v-if="editable"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('common.deleteItem', { item: round.name })"
                @click="remove.run(round)"
              >
                <Trash2Icon />
              </Button>
            </TableCell>
          </TableRow>
          <TableEmpty
            v-if="!rounds.length"
            :colspan="5 + (days?.length ? 1 : 0) + (gameRules?.length ? 1 : 0)"
            >{{ t('rankings.rounds.empty') }}</TableEmpty
          >
        </TableBody>
      </Table>
    </div>
    <RoundForm
      v-if="editable"
      :category-id="categoryId"
      :rounds="rounds"
      :round="editing"
      :days="days"
      :game-rules="gameRules"
      :event-id="eventId"
      @saved="onSaved"
      @cancel="editingId = undefined"
    />
  </div>
</template>
