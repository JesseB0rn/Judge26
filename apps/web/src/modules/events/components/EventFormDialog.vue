<script setup lang="ts">
import { t } from '@/i18n'
import { reactive, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import { createEvent, updateEvent } from '../api'
import { EVENT_STATUS_LABELS } from '../lib'

const props = defineProps<{ event?: EventRecord }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [event: EventRecord] }>()

const form = reactive({
  name: '',
  season: new Date().getFullYear(),
  venue: '',
  description: '',
  status: 'draft' as EventRecord['status'],
})

const { run, pending, error, fieldErrors, reset } = useSubmit(async () => {
  const data = {
    name: form.name,
    season: form.season,
    venue: form.venue,
    description: form.description,
    status: form.status,
  }
  const saved = props.event ? await updateEvent(props.event.id, data) : await createEvent(data)
  emit('saved', saved)
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  const e = props.event
  Object.assign(form, {
    name: e?.name ?? '',
    season: e?.season ?? new Date().getFullYear(),
    venue: e?.venue ?? '',
    description: e?.description ?? '',
    status: e?.status ?? 'draft',
  })
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{
          event ? t('events.form.editTitle') : t('events.form.newTitle')
        }}</DialogTitle>
        <DialogDescription>{{ t('events.form.description') }}</DialogDescription>
      </DialogHeader>
      <form id="event-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FieldGroup>
          <FormField v-slot="{ id }" :label="t('common.name')" name="name" :errors="fieldErrors">
            <Input :id="id" v-model="form.name" required />
          </FormField>
          <div class="grid grid-cols-2 gap-4">
            <FormField
              v-slot="{ id }"
              :label="t('events.season')"
              name="season"
              :errors="fieldErrors"
            >
              <Input
                :id="id"
                v-model.number="form.season"
                type="number"
                min="2000"
                max="2100"
                required
              />
            </FormField>
            <FormField
              v-slot="{ id }"
              :label="t('common.status')"
              name="status"
              :errors="fieldErrors"
            >
              <NativeSelect :id="id" v-model="form.status" class="w-full">
                <NativeSelectOption
                  v-for="(label, value) in EVENT_STATUS_LABELS"
                  :key="value"
                  :value="value"
                  >{{ label }}</NativeSelectOption
                >
              </NativeSelect>
            </FormField>
          </div>
          <FormField v-slot="{ id }" :label="t('events.venue')" name="venue" :errors="fieldErrors">
            <Input :id="id" v-model="form.venue" />
          </FormField>
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
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="event-form" :disabled="pending">{{ t('common.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
