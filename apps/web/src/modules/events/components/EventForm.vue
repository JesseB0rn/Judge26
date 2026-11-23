<script setup lang="ts">
import { t, type MessageKey } from '@/i18n'
import { computed, reactive } from 'vue'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import { createEvent, updateEvent } from '../api'

/**
 * The fields of an event, for creating (M11-12: in the New event dialog) and editing. M11-10:
 * there is no status field; a new event is a draft and the header's Publish, Archive and
 * Restore change it. M11-11: a new event may get its first day. Mounted fresh on each open.
 */
const props = defineProps<{ event?: EventRecord; formId: string }>()
const emit = defineEmits<{ saved: [event: EventRecord] }>()

const e = props.event
const form = reactive({
  name: e?.name ?? '',
  season: e?.season ?? new Date().getFullYear(),
  venue: e?.venue ?? '',
  description: e?.description ?? '',
  time_decimals: e?.time_decimals ?? 0,
  time_seconds_only: e?.time_seconds_only ?? false,
  allow_team_refusal: e?.allow_team_refusal ?? false,
  day_date: '',
  day_starts_at: '08:00',
  day_ends_at: '18:00',
})
// The select needs strings; the record stores a boolean.
const timeFormat = computed({
  get: () => (form.time_seconds_only ? 'seconds' : 'minutes'),
  set: (value: string) => (form.time_seconds_only = value === 'seconds'),
})

const { run, pending, error, fieldErrors } = useSubmit(async () => {
  const data = {
    name: form.name,
    season: form.season,
    venue: form.venue,
    description: form.description,
    time_decimals: form.time_decimals,
    time_seconds_only: form.time_seconds_only,
    allow_team_refusal: form.allow_team_refusal,
  }
  const firstDay = form.day_date
    ? { date: form.day_date, starts_at: form.day_starts_at, ends_at: form.day_ends_at }
    : undefined
  const saved = props.event
    ? await updateEvent(props.event.id, data)
    : await createEvent({ ...data, ...(firstDay ? { first_day: firstDay } : {}) })
  emit('saved', saved)
})

defineExpose({ pending })
</script>

<template>
  <form :id="formId" class="flex flex-col gap-4" @submit.prevent="run()">
    <ErrorAlert :error="error" />
    <p v-if="!event" class="text-sm text-muted-foreground" data-testid="draft-notice">
      {{ t('events.form.draftNotice') }}
    </p>
    <FieldGroup>
      <FormField v-slot="{ id }" :label="t('common.name')" name="name" :errors="fieldErrors">
        <Input :id="id" v-model="form.name" required />
      </FormField>
      <FormField v-slot="{ id }" :label="t('events.season')" name="season" :errors="fieldErrors">
        <Input :id="id" v-model.number="form.season" type="number" min="2000" max="2100" required />
      </FormField>
      <fieldset v-if="!event" class="flex flex-col gap-2" data-testid="first-day">
        <legend class="mb-2 text-sm font-medium">{{ t('events.form.firstDay') }}</legend>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <FormField
            v-slot="{ id }"
            :label="t('common.date')"
            name="first_day"
            :errors="fieldErrors"
          >
            <Input :id="id" v-model="form.day_date" type="date" data-testid="first-day-date" />
          </FormField>
          <FormField v-slot="{ id }" :label="t('events.form.dayStart')" name="day_starts_at">
            <Input :id="id" v-model="form.day_starts_at" type="time" :disabled="!form.day_date" />
          </FormField>
          <FormField v-slot="{ id }" :label="t('events.form.dayEnd')" name="day_ends_at">
            <Input :id="id" v-model="form.day_ends_at" type="time" :disabled="!form.day_date" />
          </FormField>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('events.form.firstDayHint') }}</p>
      </fieldset>
      <FormField v-slot="{ id }" :label="t('events.venue')" name="venue" :errors="fieldErrors">
        <Input :id="id" v-model="form.venue" />
      </FormField>
      <FormField
        v-slot="{ id }"
        :label="t('events.form.timeDecimals')"
        name="time_decimals"
        :errors="fieldErrors"
        :description="t('events.form.timeDecimalsHint')"
      >
        <NativeSelect
          :id="id"
          v-model.number="form.time_decimals"
          class="w-full"
          data-testid="time-decimals"
        >
          <NativeSelectOption v-for="d in [0, 1, 2, 3]" :key="d" :value="d">{{
            t(`events.form.timeDecimalsOption.${d}` as MessageKey)
          }}</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FormField
        v-slot="{ id }"
        :label="t('events.form.timeFormat')"
        name="time_seconds_only"
        :errors="fieldErrors"
      >
        <NativeSelect :id="id" v-model="timeFormat" class="w-full" data-testid="time-format">
          <NativeSelectOption value="minutes">{{
            t('events.form.timeFormatOption.minutes')
          }}</NativeSelectOption>
          <NativeSelectOption value="seconds">{{
            t('events.form.timeFormatOption.seconds')
          }}</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <label class="flex items-start gap-2 text-sm" data-testid="allow-team-refusal">
        <input
          v-model="form.allow_team_refusal"
          type="checkbox"
          class="mt-0.5 size-4 accent-primary"
        />
        <span>
          {{ t('events.form.allowTeamRefusal') }}
          <span class="block text-xs text-muted-foreground">{{
            t('events.form.allowTeamRefusalHint')
          }}</span>
        </span>
      </label>
      <FormField
        v-slot="{ id }"
        :label="t('common.description')"
        name="description"
        :errors="fieldErrors"
      >
        <Textarea :id="id" v-model="form.description" rows="3" />
      </FormField>
    </FieldGroup>
  </form>
</template>
