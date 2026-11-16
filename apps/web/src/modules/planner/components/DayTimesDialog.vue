<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
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
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { isConflict, updateDayTimes } from '../api'
import { dayName } from '../lib'
import type { PlannerDay } from '../types'

/**
 * Start and end time of a competition day, edited from the planner (M10-21). Items that end up
 * outside the day are not moved; the planner flags them. The write carries the loaded version.
 */
const props = defineProps<{ day: PlannerDay | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: []; conflict: [] }>()

const startsAt = ref('')
const endsAt = ref('')
watch(
  () => [open.value, props.day] as const,
  ([isOpen, day]) => {
    if (!isOpen || !day) return
    startsAt.value = day.starts_at
    endsAt.value = day.ends_at
    save.reset()
  },
  { immediate: true },
)

const save = useSubmit(async () => {
  if (!props.day) return
  try {
    await updateDayTimes(props.day, { starts_at: startsAt.value, ends_at: endsAt.value })
  } catch (error) {
    if (!isConflict(error)) throw error
    open.value = false
    emit('conflict')
    return
  }
  open.value = false
  emit('saved')
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-sm" data-testid="day-times-dialog">
      <DialogHeader>
        <DialogTitle>{{
          t('planner.dayTimes.title', { day: dayName(day ?? undefined) })
        }}</DialogTitle>
        <DialogDescription>{{ t('planner.dayTimes.description') }}</DialogDescription>
      </DialogHeader>
      <ErrorAlert :error="save.error.value" />
      <form class="grid grid-cols-2 gap-3" @submit.prevent="save.run()">
        <FormField
          v-slot="{ id }"
          :label="t('planner.dayTimes.start')"
          name="starts_at"
          :errors="save.fieldErrors.value"
        >
          <Input :id="id" v-model="startsAt" type="time" step="300" required />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('planner.dayTimes.end')"
          name="ends_at"
          :errors="save.fieldErrors.value"
        >
          <Input :id="id" v-model="endsAt" type="time" step="300" required />
        </FormField>
        <DialogFooter class="col-span-2">
          <Button type="button" variant="outline" @click="open = false">{{
            t('common.cancel')
          }}</Button>
          <Button type="submit" :disabled="save.pending.value || !startsAt || !endsAt">{{
            t('common.save')
          }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
