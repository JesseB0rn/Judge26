<script setup lang="ts">
import { reactive, watch } from 'vue'
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
import type { GameRecord, TableRecord } from '@/shared/types/records'
import { saveGameAssignment } from '../api'
import { gameLabel } from '../lib'

const props = defineProps<{
  game?: GameRecord
  tables: TableRecord[]
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const form = reactive({ table: '', sequence: 1 })

const { run, pending, error, fieldErrors, reset } = useSubmit(async () => {
  if (!props.game) return
  await saveGameAssignment(props.game, { table: form.table, sequence: form.sequence })
  emit('saved')
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen || !props.game) return
  reset()
  Object.assign(form, {
    table: props.game.table,
    sequence: props.game.sequence || 1,
  })
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ game ? gameLabel(game) : 'Schedule game' }}</DialogTitle>
        <DialogDescription>
          Choose the table and the team’s sequence on that table for this round.
        </DialogDescription>
      </DialogHeader>
      <form id="placement-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField v-slot="{ id }" label="Table" name="table" :errors="fieldErrors">
            <NativeSelect :id="id" v-model="form.table" class="w-full" required>
              <NativeSelectOption value="">Select a table</NativeSelectOption>
              <NativeSelectOption v-for="table in tables" :key="table.id" :value="table.id">
                {{ table.name }}{{ table.active ? '' : ' (deactivated)' }}
              </NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField
            v-slot="{ id }"
            label="Sequence on this table"
            name="sequence"
            :errors="fieldErrors"
          >
            <Input
              :id="id"
              v-model.number="form.sequence"
              type="number"
              min="1"
              step="1"
              required
            />
          </FormField>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">Cancel</Button>
        <Button type="submit" form="placement-form" :disabled="pending">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
