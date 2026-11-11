<script setup lang="ts">
import { t } from '@/i18n'
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
  { success: () => t('teams.review.rejected') },
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
        <DialogTitle>{{ t('teams.review.rejectTitle', { team: team?.name ?? '' }) }}</DialogTitle>
        <DialogDescription>{{ t('teams.review.rejectDescription') }}</DialogDescription>
      </DialogHeader>
      <form id="reject-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FormField
          v-slot="{ id }"
          :label="t('teams.review.reason')"
          name="review_note"
          :errors="fieldErrors"
        >
          <Textarea :id="id" v-model="note" rows="3" required />
        </FormField>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="reject-form" variant="destructive" :disabled="pending">{{
          t('teams.review.reject')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
