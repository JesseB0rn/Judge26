<script setup lang="ts">
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
import { fromDateTimeLocal, toDateTimeLocal } from '@/shared/format'
import type { EventRecord } from '@/shared/types/records'
import { createEvent, updateEvent } from '../api'

const props = defineProps<{ event?: EventRecord }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [event: EventRecord] }>()

const form = reactive({
  name: '',
  season: new Date().getFullYear(),
  venue: '',
  description: '',
  status: 'draft' as EventRecord['status'],
  opens: '',
  closes: '',
})

const { run, pending, error, fieldErrors, reset } = useSubmit(async () => {
  const data = {
    name: form.name,
    season: form.season,
    venue: form.venue,
    description: form.description,
    status: form.status,
    registration_opens_at: fromDateTimeLocal(form.opens),
    registration_closes_at: fromDateTimeLocal(form.closes),
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
    opens: toDateTimeLocal(e?.registration_opens_at),
    closes: toDateTimeLocal(e?.registration_closes_at),
  })
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ event ? 'Edit event' : 'New event' }}</DialogTitle>
        <DialogDescription
          >Competition days and categories are managed on the event page.</DialogDescription
        >
      </DialogHeader>
      <form id="event-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FieldGroup>
          <FormField v-slot="{ id }" label="Name" name="name" :errors="fieldErrors">
            <Input :id="id" v-model="form.name" required />
          </FormField>
          <div class="grid grid-cols-2 gap-4">
            <FormField v-slot="{ id }" label="Season" name="season" :errors="fieldErrors">
              <Input
                :id="id"
                v-model.number="form.season"
                type="number"
                min="2000"
                max="2100"
                required
              />
            </FormField>
            <FormField v-slot="{ id }" label="Status" name="status" :errors="fieldErrors">
              <NativeSelect :id="id" v-model="form.status" class="w-full">
                <NativeSelectOption value="draft">Draft</NativeSelectOption>
                <NativeSelectOption value="published">Published</NativeSelectOption>
                <NativeSelectOption value="archived">Archived</NativeSelectOption>
              </NativeSelect>
            </FormField>
          </div>
          <FormField v-slot="{ id }" label="Venue" name="venue" :errors="fieldErrors">
            <Input :id="id" v-model="form.venue" />
          </FormField>
          <FormField v-slot="{ id }" label="Description" name="description" :errors="fieldErrors">
            <Textarea :id="id" v-model="form.description" rows="3" />
          </FormField>
          <div class="grid grid-cols-2 gap-4">
            <FormField
              v-slot="{ id }"
              label="Registration opens"
              name="registration_opens_at"
              :errors="fieldErrors"
            >
              <Input :id="id" v-model="form.opens" type="datetime-local" />
            </FormField>
            <FormField
              v-slot="{ id }"
              label="Registration closes"
              name="registration_closes_at"
              :errors="fieldErrors"
            >
              <Input :id="id" v-model="form.closes" type="datetime-local" />
            </FormField>
          </div>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button type="submit" form="event-form" :disabled="pending">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
