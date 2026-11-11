<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RefreshCwIcon, RotateCcwIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import type { MailOutboxRecord, MailStatus } from '@/shared/types/records'
import { listOutbox, retryMessage } from '../api'
import { STATUS_LABELS } from '../lib'

/**
 * Sent and queued notifications with their delivery state (M7-01). Failed messages can be
 * queued again once the cause (e.g. the mail server) is fixed.
 */
const props = defineProps<{ eventId?: string; canRetry: boolean }>()

const status = ref<MailStatus | ''>('')
const { data, loading, error, load } = useLoader(() =>
  listOutbox({ event: props.eventId, status: status.value }),
)

const retry = useSubmit(
  async (message: MailOutboxRecord) => {
    const updated = await retryMessage(message.id)
    if (data.value) {
      data.value.items = data.value.items.map((m) =>
        m.id === updated.id ? { ...updated, expand: m.expand } : m,
      )
    }
    return updated
  },
  { success: 'Message queued again.' },
)

const variant = (s: MailStatus) =>
  s === 'failed' ? 'destructive' : s === 'pending' ? 'outline' : 'secondary'

onMounted(load)
watch(status, load)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <NativeSelect v-model="status" aria-label="Filter by status" class="w-40">
        <NativeSelectOption value="">All messages</NativeSelectOption>
        <NativeSelectOption value="failed">Failed</NativeSelectOption>
        <NativeSelectOption value="pending">Queued</NativeSelectOption>
        <NativeSelectOption value="sent">Sent</NativeSelectOption>
      </NativeSelect>
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCwIcon /> Refresh
      </Button>
      <span v-if="data" class="text-sm text-muted-foreground">{{ data.totalItems }} messages</span>
    </div>
    <ErrorAlert :error="error ?? retry.error.value" />
    <Table data-testid="outbox">
      <TableHeader>
        <TableRow>
          <TableHead>Created</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Status</TableHead>
          <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="m in data?.items" :key="m.id" :data-status="m.status">
          <TableCell class="whitespace-nowrap">{{ formatDateTime(m.created) }}</TableCell>
          <TableCell>
            {{ m.to }}
            <span v-if="m.expand?.team" class="block text-xs text-muted-foreground">{{
              m.expand.team.name
            }}</span>
          </TableCell>
          <TableCell class="whitespace-normal">{{ m.subject }}</TableCell>
          <TableCell class="whitespace-normal">
            <Badge :variant="variant(m.status)">{{ STATUS_LABELS[m.status] }}</Badge>
            <span class="block text-xs text-muted-foreground">
              <template v-if="m.status === 'sent'">{{ formatDateTime(m.sent_at) }}</template>
              <template v-else-if="m.attempts > 0"
                >{{ m.attempts }} attempt{{ m.attempts === 1 ? '' : 's' }}</template
              >
              <template v-if="m.status === 'pending' && m.attempts > 0">
                · next {{ formatDateTime(m.next_attempt_at) }}</template
              >
            </span>
            <span v-if="m.last_error" class="block text-xs text-destructive">{{
              m.last_error
            }}</span>
          </TableCell>
          <TableCell>
            <Button
              v-if="canRetry && m.status === 'failed'"
              size="sm"
              variant="outline"
              :disabled="retry.pending.value"
              @click="retry.run(m)"
            >
              <RotateCcwIcon /> Retry
            </Button>
          </TableCell>
        </TableRow>
        <TableEmpty v-if="!loading && !data?.items.length" :colspan="5">No messages.</TableEmpty>
      </TableBody>
    </Table>
  </div>
</template>
