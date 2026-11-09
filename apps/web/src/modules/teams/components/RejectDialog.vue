<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { TeamRecord } from '@/shared/types/records'
import { updateTeam } from '../api'

const props = defineProps<{ team?: TeamRecord }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ rejected: [team: TeamRecord] }>()
const note = ref('')

const { run, pending, error, fieldErrors, reset } = useSubmit(
  async () => {
    if (!props.team) return
    emit(
      'rejected',
      await updateTeam(props.team.id, { status: 'rejected', review_note: note.value }),
    )
    open.value = false
  },
  { success: 'Registration rejected.' },
)

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  note.value = ''
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reject {{ team?.name }}</DialogTitle>
        <DialogDescription
          >The coach sees the reason and can correct and resubmit.</DialogDescription
        >
      </DialogHeader>
      <form id="reject-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FormField v-slot="{ id }" label="Reason" name="review_note" :errors="fieldErrors">
          <Textarea :id="id" v-model="note" rows="3" required />
        </FormField>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button type="submit" form="reject-form" variant="destructive" :disabled="pending"
          >Reject</Button
        >
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
