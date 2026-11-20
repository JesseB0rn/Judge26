<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EventRecord } from '@/shared/types/records'
import EventForm from './EventForm.vue'

/** Edits an event; new events come from the New event dialog (M11-12). */
defineProps<{ event: EventRecord }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [event: EventRecord] }>()
const form = ref<InstanceType<typeof EventForm>>()

function onSaved(saved: EventRecord) {
  emit('saved', saved)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('events.form.editTitle') }}</DialogTitle>
        <DialogDescription>{{ t('events.form.description') }}</DialogDescription>
      </DialogHeader>
      <EventForm ref="form" :event="event" form-id="event-form" @saved="onSaved" />
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="event-form" :disabled="form?.pending">{{
          t('common.save')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
