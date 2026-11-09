<script setup lang="ts">
import { computed, ref } from 'vue'
import { PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '@/shared/format'
import type { TimeSlotKind, TimeSlotRecord } from '@/shared/types/records'
import { deleteTimeSlot, saveTimeSlot } from '../api'
import { KIND_LABELS, isValidPeriod } from '../lib'

const props = defineProps<{ eventId: string; slots: TimeSlotRecord[]; editable: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const editingId = ref<string>()
const form = ref({ kind: 'play' as TimeSlotKind, label: '', starts: '', ends: '' })
const periodError = computed(() =>
  form.value.starts &&
  form.value.ends &&
  !isValidPeriod(fromDateTimeLocal(form.value.starts), fromDateTimeLocal(form.value.ends))
    ? 'The end must be after the start.'
    : '',
)

function startEdit(slot?: TimeSlotRecord) {
  editingId.value = slot?.id
  form.value = slot
    ? {
        kind: slot.kind,
        label: slot.label,
        starts: toDateTimeLocal(slot.starts_at),
        ends: toDateTimeLocal(slot.ends_at),
      }
    : { kind: 'play', label: '', starts: '', ends: '' }
  save.reset()
}

const save = useSubmit(async () => {
  await saveTimeSlot(props.eventId, editingId.value, {
    kind: form.value.kind,
    label: form.value.label,
    starts_at: fromDateTimeLocal(form.value.starts),
    ends_at: fromDateTimeLocal(form.value.ends),
  })
  startEdit()
  emit('changed')
})

const remove = useSubmit(async (slot: TimeSlotRecord) => {
  await deleteTimeSlot(slot.id)
  emit('changed')
})
</script>

<template>
  <Card>
    <CardHeader><CardTitle>Time slots</CardTitle></CardHeader>
    <CardContent class="flex flex-col gap-4">
      <p class="text-sm text-muted-foreground">
        Games must fit completely into an available period and may not overlap a break.
      </p>
      <ErrorAlert :error="remove.error.value" />
      <ul v-if="slots.length" class="divide-y" data-testid="time-slots">
        <li v-for="slot in slots" :key="slot.id" class="flex items-center justify-between py-2">
          <span>
            <span class="font-medium">{{ KIND_LABELS[slot.kind] }}</span>
            <span v-if="slot.label" class="text-muted-foreground"> · {{ slot.label }}</span>
            <span class="text-sm">
              {{ formatDateTime(slot.starts_at) }} – {{ formatDateTime(slot.ends_at) }}
            </span>
          </span>
          <span v-if="editable" class="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Edit period ${slot.label || slot.id}`"
              @click="startEdit(slot)"
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Delete period ${slot.label || slot.id}`"
              @click="remove.run(slot)"
            >
              <Trash2Icon />
            </Button>
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No time slots yet.</p>

      <form v-if="editable" class="flex flex-col gap-3" @submit.prevent="save.run()">
        <ErrorAlert :error="save.error.value" />
        <div class="grid gap-3 sm:grid-cols-2">
          <FormField v-slot="{ id }" label="Type" name="kind" :errors="save.fieldErrors.value">
            <NativeSelect :id="id" v-model="form.kind" class="w-full">
              <NativeSelectOption value="play">Available</NativeSelectOption>
              <NativeSelectOption value="break">Break</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField v-slot="{ id }" label="Label" name="label" :errors="save.fieldErrors.value">
            <Input :id="id" v-model="form.label" maxlength="100" placeholder="e.g. Lunch" />
          </FormField>
          <FormField
            v-slot="{ id }"
            label="Start"
            name="starts_at"
            :errors="save.fieldErrors.value"
          >
            <Input :id="id" v-model="form.starts" type="datetime-local" required />
          </FormField>
          <FormField v-slot="{ id }" label="End" name="ends_at" :errors="save.fieldErrors.value">
            <Input :id="id" v-model="form.ends" type="datetime-local" required />
          </FormField>
        </div>
        <p v-if="periodError" class="text-sm text-destructive">{{ periodError }}</p>
        <div class="flex gap-2">
          <Button type="submit" :disabled="save.pending.value || !!periodError">
            <PlusIcon v-if="!editingId" /> {{ editingId ? 'Save period' : 'Add period' }}
          </Button>
          <Button v-if="editingId" type="button" variant="outline" @click="startEdit()">
            Cancel
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
