<script setup lang="ts">
import { reactive } from 'vue'
import { Trash2Icon } from '@lucide/vue'
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
import { createRound, deleteRound } from '../api'

/** Rounds of a category (M3-01). Keys are referenced by the ranking configuration. */
const props = defineProps<{ categoryId: string; rounds: RoundRecord[]; editable: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const form = reactive({ key: '', name: '' })

const add = useSubmit(async () => {
  const position = Math.max(0, ...props.rounds.map((r) => r.position)) + 1
  await createRound(props.categoryId, { key: form.key, name: form.name, position })
  form.key = ''
  form.name = ''
  emit('changed')
})

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
            <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(round, i) in rounds" :key="round.id">
            <TableCell>{{ i + 1 }}</TableCell>
            <TableCell class="font-mono">{{ round.key }}</TableCell>
            <TableCell>{{ round.name }}</TableCell>
            <TableCell>
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
          <TableEmpty v-if="!rounds.length" :colspan="4">No rounds yet.</TableEmpty>
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
      <Button type="submit" :disabled="add.pending.value">Add round</Button>
    </form>
  </div>
</template>
