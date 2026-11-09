<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import { createDay, deleteDay, listDays } from '../api'

const props = defineProps<{ eventId: string; editable: boolean }>()

const { data: days, error: loadError, load } = useLoader(() => listDays(props.eventId))
const date = ref('')
const label = ref('')

const add = useSubmit(async () => {
  await createDay(props.eventId, date.value, label.value)
  date.value = ''
  label.value = ''
  await load()
})
const remove = useSubmit(async (id: string) => {
  await deleteDay(id)
  await load()
})

onMounted(load)
</script>

<template>
  <Card>
    <CardHeader><CardTitle>Competition days</CardTitle></CardHeader>
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="loadError ?? remove.error.value" />
      <ul v-if="days?.length" class="divide-y" data-testid="competition-days">
        <li v-for="day in days" :key="day.id" class="flex items-center justify-between py-2">
          <span>
            <span class="font-medium">{{ formatDay(day.date) }}</span>
            <span v-if="day.label" class="text-muted-foreground"> · {{ day.label }}</span>
          </span>
          <Button
            v-if="editable"
            variant="ghost"
            size="icon-sm"
            :aria-label="`Remove ${day.date}`"
            @click="remove.run(day.id)"
          >
            <Trash2Icon />
          </Button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No competition days yet.</p>
      <form v-if="editable" class="flex flex-col gap-3" @submit.prevent="add.run()">
        <ErrorAlert :error="add.error.value" />
        <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <FormField v-slot="{ id }" label="Date" name="date" :errors="add.fieldErrors.value">
            <Input :id="id" v-model="date" type="date" required />
          </FormField>
          <FormField v-slot="{ id }" label="Label" name="label" :errors="add.fieldErrors.value">
            <Input :id="id" v-model="label" placeholder="e.g. Day 1" />
          </FormField>
          <Button type="submit" :disabled="add.pending.value">Add day</Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
