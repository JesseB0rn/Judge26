<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { BellIcon, RefreshCwIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
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
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import { notifySchedule, scheduleNotices } from '../api'

/**
 * Schedule notifications (M7-04): compares every approved team's current schedule with what its
 * coach was last told, and emails the affected coaches (or everyone) on request.
 */
const props = defineProps<{ eventId: string; editable: boolean }>()
const emit = defineEmits<{ sent: [] }>()

const message = ref('')
const { data, loading, error, load } = useLoader(() => scheduleNotices(props.eventId))
const withSchedule = computed(
  () => data.value?.teams.filter((t) => t.items.length || t.notified_at).length ?? 0,
)

const send = useSubmit(async (scope: 'changed' | 'all') => {
  const { queued } = await notifySchedule(props.eventId, scope, message.value.trim())
  message.value = ''
  await load()
  emit('sent')
  return queued
})

async function run(scope: 'changed' | 'all') {
  const queued = await send.run(scope)
  if (queued !== undefined) {
    toast.success(
      queued ? `${queued} email${queued === 1 ? '' : 's'} queued.` : 'Nobody to notify.',
    )
  }
}

onMounted(load)
</script>

<template>
  <Card data-testid="schedule-notify">
    <CardHeader>
      <CardTitle>Schedule notifications</CardTitle>
      <CardDescription>
        Coaches of approved teams receive their team's games (round, time, table and position). A
        team is <strong>affected</strong> when its schedule changed since the last email.
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="error ?? send.error.value" />
      <div class="flex flex-wrap items-center gap-2">
        <Badge :variant="data?.changed ? 'default' : 'secondary'" data-testid="affected-count">
          {{ data?.changed ?? 0 }} affected
        </Badge>
        <span class="text-sm text-muted-foreground"
          >of {{ data?.teams.length ?? 0 }} approved teams</span
        >
        <Button variant="ghost" size="sm" :disabled="loading" @click="load">
          <RefreshCwIcon /> Refresh
        </Button>
      </div>
      <template v-if="editable">
        <FormField
          v-slot="{ id }"
          label="Message (optional)"
          name="message"
          description="Added to every email, e.g. the reason for the change."
        >
          <Textarea :id="id" v-model="message" rows="2" maxlength="2000" />
        </FormField>
        <div class="flex flex-wrap gap-2">
          <Button :disabled="!data?.changed || send.pending.value" @click="run('changed')">
            <BellIcon /> Notify affected teams
          </Button>
          <Button
            variant="outline"
            :disabled="!withSchedule || send.pending.value"
            @click="run('all')"
          >
            Send to all teams
          </Button>
        </div>
      </template>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Current schedule</TableHead>
            <TableHead>Last notified</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="t in data?.teams" :key="t.team.id" :data-changed="t.changed">
            <TableCell>
              {{ t.team.name }}
              <span class="block text-xs text-muted-foreground">{{ t.coach_email }}</span>
            </TableCell>
            <TableCell class="whitespace-normal text-sm">
              <ul v-if="t.items.length">
                <li v-for="(item, i) in t.items" :key="i">{{ item.text }}</li>
              </ul>
              <span v-else class="text-muted-foreground">No games</span>
            </TableCell>
            <TableCell class="whitespace-nowrap">
              <Badge v-if="t.changed" variant="outline">Changed</Badge>
              <span class="block text-xs text-muted-foreground">{{
                t.notified_at ? formatDateTime(t.notified_at) : 'Never'
              }}</span>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!loading && !data?.teams.length" :colspan="3"
            >No approved teams yet.</TableEmpty
          >
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
