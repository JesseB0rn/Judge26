<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, reactive } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import { createEventFromTemplate, listEventTemplates } from '../api'
import { templateSummary } from '../lib'

/**
 * New event from a library template (M8-23): name and first day; all dates shift relative to the
 * first day. `templateId` preselects a template (from the library page). Part of the New event
 * dialog (M11-12); mounted fresh on each open.
 */
const props = defineProps<{ templateId?: string; formId: string }>()
const emit = defineEmits<{ created: [event: EventRecord] }>()

const templates = useLoader(listEventTemplates)
const form = reactive({
  template: props.templateId ?? '',
  name: '',
  first_day: '',
  season: '',
  venue: '',
})

const chosen = computed(() => templates.data.value?.find((x) => x.id === form.template))
const summary = computed(() => templateSummary(chosen.value?.data))

const { run, pending, error, fieldErrors } = useSubmit(
  async () => {
    const event = await createEventFromTemplate(form.template, {
      name: form.name,
      first_day: form.first_day,
      ...(form.season ? { season: Number(form.season) } : {}),
      ...(form.venue.trim() ? { venue: form.venue.trim() } : {}),
    })
    emit('created', event)
  },
  { success: () => t('templates.create.created') },
)

onMounted(async () => {
  await templates.load()
  if (!form.template && templates.data.value?.length === 1)
    form.template = templates.data.value[0]!.id
})

defineExpose({ pending, ready: computed(() => !!form.template) })
</script>

<template>
  <form :id="formId" class="flex flex-col gap-4" @submit.prevent="run()">
    <ErrorAlert :error="error ?? templates.error.value" />
    <Alert v-if="templates.data.value && !templates.data.value.length">
      <AlertDescription>{{ t('templates.create.noTemplates') }}</AlertDescription>
    </Alert>
    <p class="text-sm text-muted-foreground">{{ t('templates.create.description') }}</p>
    <FieldGroup>
      <FormField v-slot="{ id }" :label="t('templates.create.template')" name="template">
        <NativeSelect :id="id" v-model="form.template" class="w-full" required>
          <NativeSelectOption value="" disabled>{{
            t('templates.create.chooseTemplate')
          }}</NativeSelectOption>
          <NativeSelectOption v-for="x in templates.data.value" :key="x.id" :value="x.id">{{
            x.name
          }}</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <p v-if="chosen" class="-mt-2 text-sm text-muted-foreground" data-testid="template-summary">
        {{ t('templates.library.days', summary.days) }} ·
        {{ summary.categories.join(', ') || '–' }} ·
        {{ t('templates.library.tables', summary.tables) }}
      </p>
      <FormField v-slot="{ id }" :label="t('common.name')" name="name" :errors="fieldErrors">
        <Input :id="id" v-model="form.name" required maxlength="200" />
      </FormField>
      <div class="grid grid-cols-2 gap-4">
        <FormField
          v-slot="{ id }"
          :label="t('templates.create.firstDay')"
          name="first_day"
          :errors="fieldErrors"
        >
          <Input :id="id" v-model="form.first_day" type="date" required />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('templates.create.season')"
          name="season"
          :errors="fieldErrors"
          :description="t('templates.create.seasonHint')"
        >
          <Input :id="id" v-model="form.season" type="number" min="2000" max="2100" />
        </FormField>
      </div>
      <FormField
        v-slot="{ id }"
        :label="t('events.venue')"
        name="venue"
        :description="t('templates.create.venueHint')"
      >
        <Input :id="id" v-model="form.venue" maxlength="200" />
      </FormField>
    </FieldGroup>
  </form>
</template>
