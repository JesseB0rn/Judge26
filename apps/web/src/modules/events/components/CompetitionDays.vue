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
import type { CompetitionDayRecord } from '@/shared/types/records'
import { createDay, deleteDay, listDays, updateDayWindow } from '../api'

const DEFAULT_START = '08:00'
const DEFAULT_END = '18:00'

const props = defineProps<{ eventId: string; editable: boolean }>()

const { data: days, error: loadError, load } = useLoader(() => listDays(props.eventId))
const date = ref('')
const label = ref('')
const startsAt = ref(DEFAULT_START)
const endsAt = ref(DEFAULT_END)

const add = useSubmit(async () => {
  await createDay(props.eventId, date.value, label.value, {
    starts_at: startsAt.value,
    ends_at: endsAt.value,
  })
  date.value = ''
  label.value = ''
  await load()
})
const remove = useSubmit(async (id: string) => {
  await deleteDay(id)
  await load()
})
// Hours of a day (M4-14-01): the planner's time axis covers them.
const saveWindow = useSubmit(
  async (day: CompetitionDayRecord, field: 'starts_at' | 'ends_at', value: string) => {
    if (!value) return
    const window = {
      starts_at: day.starts_at || DEFAULT_START,
      ends_at: day.ends_at || DEFAULT_END,
      [field]: value,
    }
    try {
      await updateDayWindow(day.id, window)
    } finally {
      await load()
    }
  },
  { success: 'Hours saved.' },
)

onMounted(load)
</script>

<template>
  <Card>
    <CardHeader><CardTitle>Competition days</CardTitle></CardHeader>
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="loadError ?? remove.error.value ?? saveWindow.error.value" />
      <ul v-if="days?.length" class="divide-y" data-testid="competition-days">
        <li
          v-for="day in days"
          :key="day.id"
          class="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <span>
            <span class="font-medium">{{ formatDay(day.date) }}</span>
            <span v-if="day.label" class="text-muted-foreground"> · {{ day.label }}</span>
          </span>
          <span class="flex items-center gap-1 text-sm">
            <template v-if="editable">
              <Input
                type="time"
                step="300"
                class="h-8 w-28"
                :model-value="day.starts_at || DEFAULT_START"
                :aria-label="`Start of ${day.date}`"
                @change="
                  saveWindow.run(day, 'starts_at', ($event.target as HTMLInputElement).value)
                "
              />
              –
              <Input
                type="time"
                step="300"
                class="h-8 w-28"
                :model-value="day.ends_at || DEFAULT_END"
                :aria-label="`End of ${day.date}`"
                @change="saveWindow.run(day, 'ends_at', ($event.target as HTMLInputElement).value)"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                :aria-label="`Remove ${day.date}`"
                @click="remove.run(day.id)"
              >
                <Trash2Icon />
              </Button>
            </template>
            <span v-else class="tabular-nums text-muted-foreground"
              >{{ day.starts_at || DEFAULT_START }}–{{ day.ends_at || DEFAULT_END }}</span
            >
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No competition days yet.</p>
      <form v-if="editable" class="flex flex-col gap-3" @submit.prevent="add.run()">
        <ErrorAlert :error="add.error.value" />
        <div class="grid gap-3 sm:grid-cols-2">
          <FormField v-slot="{ id }" label="Date" name="date" :errors="add.fieldErrors.value">
            <Input :id="id" v-model="date" type="date" required />
          </FormField>
          <FormField v-slot="{ id }" label="Label" name="label" :errors="add.fieldErrors.value">
            <Input :id="id" v-model="label" placeholder="e.g. Day 1" />
          </FormField>
          <FormField
            v-slot="{ id }"
            label="Starts"
            name="starts_at"
            :errors="add.fieldErrors.value"
          >
            <Input :id="id" v-model="startsAt" type="time" step="300" required />
          </FormField>
          <FormField v-slot="{ id }" label="Ends" name="ends_at" :errors="add.fieldErrors.value">
            <Input :id="id" v-model="endsAt" type="time" step="300" required />
          </FormField>
        </div>
        <Button type="submit" class="self-start" :disabled="add.pending.value">Add day</Button>
      </form>
    </CardContent>
  </Card>
</template>
