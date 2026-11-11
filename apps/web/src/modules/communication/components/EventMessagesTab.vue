<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { EventRecord } from '@/shared/types/records'
import OutboxTable from './OutboxTable.vue'
import ScheduleNotifyCard from './ScheduleNotifyCard.vue'

/** Event managers: schedule notifications and the event's delivery log (M7-01, M7-04). */
defineProps<{ event: EventRecord; editable: boolean }>()
// Re-mounts the log after sending so new messages show up.
const logKey = ref(0)
</script>

<template>
  <div class="flex flex-col gap-4">
    <ScheduleNotifyCard :event-id="event.id" :editable="editable" @sent="logKey++" />
    <Card>
      <CardHeader>
        <CardTitle>{{ t('communication.outbox.title') }}</CardTitle>
        <CardDescription>{{ t('communication.outbox.eventDescription') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <OutboxTable :key="logKey" :event-id="event.id" :can-retry="editable" />
      </CardContent>
    </Card>
  </div>
</template>
