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
import { fromDateTimeLocal, toDateTimeLocal } from '@/shared/format'
import type { GameRecord, TableRecord } from '@/shared/types/records'
import { savePlacement, type EventJudge } from '../api'
import { gameLabel } from '../lib'

const props = defineProps<{
  game?: GameRecord
  tables: TableRecord[]
  judges: EventJudge[]
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const form = reactive({ table: '', starts: '', judges: [] as string[], locked: false })

const { run, pending, error, fieldErrors, reset } = useSubmit(async () => {
  if (!props.game) return
  await savePlacement(props.game, {
    table: form.table,
    starts_at: fromDateTimeLocal(form.starts),
    judges: form.judges,
    locked: form.locked,
  })
  emit('saved')
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen || !props.game) return
  reset()
  Object.assign(form, {
    table: props.game.table,
    starts: toDateTimeLocal(props.game.starts_at),
    judges: [...props.game.judges],
    locked: props.game.locked,
  })
})

function toggleJudge(id: string, checked: boolean) {
  const set = new Set(form.judges)
  if (checked) set.add(id)
  else set.delete(id)
  form.judges = [...set]
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ game ? gameLabel(game) : 'Schedule game' }}</DialogTitle>
        <DialogDescription>
          Leave the table and start empty to unschedule the game. Locked games are kept when the
          schedule is generated again.
        </DialogDescription>
      </DialogHeader>
      <form id="placement-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField v-slot="{ id }" label="Table" name="table" :errors="fieldErrors">
            <NativeSelect :id="id" v-model="form.table" class="w-full">
              <NativeSelectOption value="">Unassigned</NativeSelectOption>
              <NativeSelectOption v-for="table in tables" :key="table.id" :value="table.id">
                {{ table.name }}{{ table.active ? '' : ' (deactivated)' }}
              </NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField v-slot="{ id }" label="Start" name="starts_at" :errors="fieldErrors">
            <Input :id="id" v-model="form.starts" type="datetime-local" />
          </FormField>
        </div>
        <fieldset class="flex flex-col gap-1 text-sm">
          <legend class="text-muted-foreground">Judges</legend>
          <p v-if="!judges.length" class="text-muted-foreground">
            No judges have a role in this event yet.
          </p>
          <label v-for="judge in judges" :key="judge.id" class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="form.judges.includes(judge.id)"
              @change="toggleJudge(judge.id, ($event.target as HTMLInputElement).checked)"
            />
            {{ judge.name }}
          </label>
          <p v-if="fieldErrors.judges" class="text-destructive">{{ fieldErrors.judges }}</p>
        </fieldset>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="form.locked" type="checkbox" /> Locked (keep this placement)
        </label>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">Cancel</Button>
        <Button type="submit" form="placement-form" :disabled="pending">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
