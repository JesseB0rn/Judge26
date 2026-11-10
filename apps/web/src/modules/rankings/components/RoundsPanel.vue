<script setup lang="ts">
import { reactive, ref } from 'vue'
import { PencilIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { RoundRecord } from '@/shared/types/records'
import { createRound, deleteRound, updateRound } from '../api'

/** Rounds of a category (M3-01). Keys are referenced by the ranking configuration. */
const props = defineProps<{ categoryId: string; rounds: RoundRecord[]; editable: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const form = reactive({ key: '', name: '', testing_minutes: 0, scoring_minutes: 15 })
const editingId = ref<string>()

const add = useSubmit(async () => {
  const data = {
    key: form.key,
    name: form.name,
    position: Math.max(0, ...props.rounds.map((r) => r.position)) + 1,
    testing_minutes: form.testing_minutes,
    scoring_minutes: form.scoring_minutes,
  }
  if (editingId.value) {
    const round = props.rounds.find((item) => item.id === editingId.value)
    if (!round) throw new Error('The round being edited no longer exists.')
    await updateRound(round.id, { ...data, position: round.position })
  } else {
    await createRound(props.categoryId, data)
  }
  resetForm()
  emit('changed')
})

function resetForm() {
  editingId.value = undefined
  form.key = ''
  form.name = ''
  form.testing_minutes = 0
  form.scoring_minutes = 15
}

function edit(round: RoundRecord) {
  editingId.value = round.id
  form.key = round.key
  form.name = round.name
  form.testing_minutes = round.testing_minutes
  form.scoring_minutes = round.scoring_minutes
  add.reset()
}

const remove = useSubmit(async (round: RoundRecord) => {
  if (!confirm(`Delete ${round.name}? All results recorded in this round are deleted too.`)) return
  await deleteRound(round.id)
  emit('changed')
})
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <div class="flex flex-col gap-2">
      <ErrorAlert :error="remove.error.value" />
      <Table data-testid="rounds">
        <TableHeader>
          <TableRow>
            <TableHead class="w-16">#</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Phases</TableHead>
            <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(round, i) in rounds" :key="round.id">
            <TableCell>{{ i + 1 }}</TableCell>
            <TableCell class="font-mono">{{ round.key }}</TableCell>
            <TableCell>{{ round.name }}</TableCell>
            <TableCell class="text-sm">
              Testing {{ round.testing_minutes }}m · Scoring {{ round.scoring_minutes }}m · Total
              {{ round.testing_minutes + round.scoring_minutes }}m
            </TableCell>
            <TableCell>
              <Button
                v-if="editable"
                variant="ghost"
                size="icon-sm"
                :aria-label="`Edit ${round.name}`"
                @click="edit(round)"
              >
                <PencilIcon />
              </Button>
              <Button
                v-if="editable"
                variant="ghost"
                size="icon-sm"
                :aria-label="`Delete ${round.name}`"
                @click="remove.run(round)"
              >
                <Trash2Icon />
              </Button>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!rounds.length" :colspan="5">No rounds yet.</TableEmpty>
        </TableBody>
      </Table>
    </div>
    <form v-if="editable" class="flex flex-col gap-3" @submit.prevent="add.run()">
      <ErrorAlert :error="add.error.value" />
      <FormField
        v-slot="{ id }"
        label="Key"
        name="key"
        :errors="add.fieldErrors.value"
        description="Used in the ranking configuration, e.g. R1."
      >
        <Input :id="id" v-model="form.key" required pattern="[A-Za-z][A-Za-z0-9_\-]*" />
      </FormField>
      <FormField v-slot="{ id }" label="Round name" name="name" :errors="add.fieldErrors.value">
        <Input :id="id" v-model="form.name" required />
      </FormField>
      <FormField
        v-slot="{ id }"
        label="Maintenance / testing (minutes)"
        name="testing_minutes"
        :errors="add.fieldErrors.value"
      >
        <Input
          :id="id"
          v-model.number="form.testing_minutes"
          type="number"
          min="0"
          step="1"
          required
        />
      </FormField>
      <FormField
        v-slot="{ id }"
        label="Scoring phase (minutes)"
        name="scoring_minutes"
        :errors="add.fieldErrors.value"
      >
        <Input
          :id="id"
          v-model.number="form.scoring_minutes"
          type="number"
          min="1"
          step="1"
          required
        />
      </FormField>
      <p class="text-sm text-muted-foreground">
        Total round duration: {{ form.testing_minutes + form.scoring_minutes }} minutes.
      </p>
      <div class="flex gap-2">
        <Button type="submit" :disabled="add.pending.value">
          {{ editingId ? 'Save round' : 'Add round' }}
        </Button>
        <Button v-if="editingId" type="button" variant="outline" @click="resetForm">Cancel</Button>
      </div>
    </form>
  </div>
</template>
