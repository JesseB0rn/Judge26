<script setup lang="ts">
import { t } from '@/i18n'
import { computed, reactive, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { PlusIcon, SettingsIcon, Trash2Icon, Undo2Icon } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import { addCheck, isConflict, removeCheck, updatePhase } from '../api'
import { DEFAULT_CHECK_MINUTES, dayName, PHASE_LABELS, timeRange } from '../lib'
import type { PlannerCategory, PlannerDay, PlannerPhase, PlannerRound } from '../types'

/**
 * A phase of a round (M4-14-02): place it, change its duration, unplace it, add or remove the
 * robot check (M4-14-13), and open the round's settings (M4-14-16). Details when read-only.
 */
const props = defineProps<{
  phase: PlannerPhase | null
  round: PlannerRound | undefined
  category: PlannerCategory | undefined
  /** All phases of the round. */
  siblings: PlannerPhase[]
  days: PlannerDay[]
  editable: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: []; conflict: [] }>()
const route = useRoute()

const form = reactive({ day: '', starts_at: '', duration_minutes: 1 })
const check = computed(() => props.siblings.find((p) => p.phase === 'check'))

function guard(action: () => Promise<void>) {
  return async () => {
    try {
      await action()
    } catch (error) {
      if (isConflict(error)) emit('conflict')
      throw error
    }
  }
}

const save = useSubmit(
  guard(async () => {
    if (!props.phase) return
    await updatePhase(props.phase, { ...form })
    emit('changed')
    open.value = false
  }),
)

const unplace = useSubmit(
  guard(async () => {
    if (!props.phase) return
    await updatePhase(props.phase, { starts_at: '' })
    emit('changed')
    open.value = false
  }),
)

const toggleCheck = useSubmit(async () => {
  if (!props.round) return
  if (check.value) {
    if (!confirm(t('planner.phaseDialog.confirmRemoveCheck'))) return
    await removeCheck(check.value.id)
  } else {
    await addCheck(props.round.id, DEFAULT_CHECK_MINUTES)
  }
  emit('changed')
  open.value = false
})

// Fill the form when the dialog opens (also already open on a deep link) or shows another
// phase; a live reload of the same phase does not overwrite what is being typed.
watch(
  () => (open.value && props.phase ? props.phase.id : ''),
  (key) => {
    if (!key || !props.phase) return
    for (const action of [save, unplace, toggleCheck]) action.reset()
    Object.assign(form, {
      day: props.phase.day,
      starts_at: props.phase.starts_at,
      duration_minutes: props.phase.duration_minutes,
    })
  },
  { immediate: true },
)

const settingsLink = computed(() =>
  props.round
    ? {
        name: 'category-ranking',
        params: { id: props.round.category },
        query: { tab: 'rounds', round: props.round.id, from: route.fullPath },
      }
    : null,
)
const error = computed(() => save.error.value ?? unplace.error.value ?? toggleCheck.error.value)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ round ? `${round.key} · ${round.name}` : t('teams.mine.round') }}
        </DialogTitle>
        <DialogDescription>
          {{ phase ? PHASE_LABELS[phase.phase] : '' }}{{ category ? ` · ${category.name}` : '' }}
        </DialogDescription>
      </DialogHeader>

      <dl v-if="!editable && phase" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">{{ t('teams.mine.when') }}</dt>
        <dd>
          <template v-if="phase.starts_at">
            {{ dayName(days.find((d) => d.id === phase?.day)) }},
          </template>
          {{ timeRange(phase.starts_at, phase.duration_minutes) }}
        </dd>
        <dt class="text-muted-foreground">{{ t('planner.duration') }}</dt>
        <dd>{{ t('planner.minutes', { count: phase.duration_minutes }) }}</dd>
      </dl>

      <form v-else id="phase-form" class="flex flex-col gap-4" @submit.prevent="save.run()">
        <ErrorAlert :error="error" />
        <div class="grid gap-4 sm:grid-cols-3">
          <FormField
            v-slot="{ id }"
            :label="t('scheduling.export.day')"
            name="day"
            :errors="save.fieldErrors.value"
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
            :label="t('planner.start')"
            name="starts_at"
            :errors="save.fieldErrors.value"
            :description="t('planner.startHint')"
          >
            <Input :id="id" v-model="form.starts_at" type="time" step="300" />
          </FormField>
          <FormField
            v-slot="{ id }"
            :label="t('planner.durationMin')"
            name="duration_minutes"
            :errors="save.fieldErrors.value"
          >
            <Input
              :id="id"
              v-model.number="form.duration_minutes"
              type="number"
              min="1"
              max="1440"
              step="1"
              required
            />
          </FormField>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ t('planner.phaseDialog.hint') }}
        </p>
      </form>

      <DialogFooter class="gap-2 sm:justify-between">
        <div class="flex flex-wrap gap-2">
          <Button v-if="settingsLink && editable" as-child variant="outline">
            <RouterLink :to="settingsLink"
              ><SettingsIcon /> {{ t('planner.phaseDialog.settings') }}</RouterLink
            >
          </Button>
          <Button
            v-if="editable && phase?.starts_at"
            type="button"
            variant="outline"
            :disabled="unplace.pending.value"
            @click="unplace.run()"
            ><Undo2Icon /> {{ t('planner.unplace') }}</Button
          >
          <Button
            v-if="editable && phase && (phase.phase === 'check' || !check)"
            type="button"
            variant="outline"
            :disabled="toggleCheck.pending.value"
            @click="toggleCheck.run()"
          >
            <template v-if="check"
              ><Trash2Icon /> {{ t('planner.phaseDialog.removeCheck') }}</template
            >
            <template v-else><PlusIcon /> {{ t('planner.phaseDialog.addCheck') }}</template>
          </Button>
        </div>
        <div class="flex gap-2">
          <Button type="button" variant="outline" @click="open = false">{{
            editable ? t('common.cancel') : t('planner.close')
          }}</Button>
          <Button v-if="editable" type="submit" form="phase-form" :disabled="save.pending.value">{{
            t('common.save')
          }}</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
