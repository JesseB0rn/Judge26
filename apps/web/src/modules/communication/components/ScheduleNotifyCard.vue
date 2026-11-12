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
import { locale, t } from '@/i18n'
import { notifySchedule, scheduleNotices } from '../api'
import { describeItem } from '../lib'

/**
 * Schedule notifications (M7-04): compares every approved team's current schedule with what its
 * team's contact was last told, and emails the affected contacts (or everyone) on request.
 * Teams without a contact email are listed but get no email.
 */
const props = defineProps<{ eventId: string; editable: boolean }>()
const emit = defineEmits<{ sent: [] }>()

const message = ref('')
const { data, loading, error, load } = useLoader(() => scheduleNotices(props.eventId))
const withSchedule = computed(
  () => data.value?.teams.filter((n) => n.items.length || n.notified_at).length ?? 0,
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
    toast.success(t('communication.notify.queued', queued))
  }
}

onMounted(load)
</script>

<template>
  <Card data-testid="schedule-notify">
    <CardHeader>
      <CardTitle>{{ t('communication.notify.title') }}</CardTitle>
      <CardDescription>{{ t('communication.notify.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="error ?? send.error.value" />
      <div class="flex flex-wrap items-center gap-2">
        <Badge :variant="data?.changed ? 'default' : 'secondary'" data-testid="affected-count">
          {{ t('communication.notify.affected', { count: data?.changed ?? 0 }) }}
        </Badge>
        <span class="text-sm text-muted-foreground">{{
          t('communication.notify.ofApproved', { count: data?.teams.length ?? 0 })
        }}</span>
        <Button variant="ghost" size="sm" :disabled="loading" @click="load">
          <RefreshCwIcon /> {{ t('common.refresh') }}
        </Button>
      </div>
      <template v-if="editable">
        <FormField
          v-slot="{ id }"
          :label="t('communication.notify.message')"
          name="message"
          :description="t('communication.notify.messageHint')"
        >
          <Textarea :id="id" v-model="message" rows="2" maxlength="2000" />
        </FormField>
        <div class="flex flex-wrap gap-2">
          <Button :disabled="!data?.changed || send.pending.value" @click="run('changed')">
            <BellIcon /> {{ t('communication.notify.sendChanged') }}
          </Button>
          <Button
            variant="outline"
            :disabled="!withSchedule || send.pending.value"
            @click="run('all')"
          >
            {{ t('communication.notify.sendAll') }}
          </Button>
        </div>
      </template>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('teams.team') }}</TableHead>
            <TableHead>{{ t('communication.notify.current') }}</TableHead>
            <TableHead>{{ t('communication.notify.lastNotified') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="notice in data?.teams"
            :key="notice.team.id"
            :data-changed="notice.changed"
          >
            <TableCell>
              {{ notice.team.name }}
              <span class="block text-xs text-muted-foreground">{{
                notice.contact_email || t('communication.notify.noContact')
              }}</span>
            </TableCell>
            <TableCell class="whitespace-normal text-sm">
              <ul v-if="notice.items.length">
                <li v-for="(item, i) in notice.items" :key="i">{{ describeItem(item, locale) }}</li>
              </ul>
              <span v-else class="text-muted-foreground">{{
                t('communication.notify.noGames')
              }}</span>
            </TableCell>
            <TableCell class="whitespace-nowrap">
              <Badge v-if="notice.changed" variant="outline">{{
                t('communication.notify.changed')
              }}</Badge>
              <span class="block text-xs text-muted-foreground">{{
                notice.notified_at
                  ? formatDateTime(notice.notified_at)
                  : t('communication.notify.never')
              }}</span>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!loading && !data?.teams.length" :colspan="3">{{
            t('communication.notify.empty')
          }}</TableEmpty>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
