<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import SortableTableHead from '@/shared/components/SortableTableHead.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useLoader } from '@/shared/composables/useSubmit'
import { useSort } from '@/shared/composables/useSort'
import type { EventRecord } from '@/shared/types/records'
import { listEvents } from '../api'
import NewEventDialog from '../components/NewEventDialog.vue'
import EventStatusBadge from '../components/EventStatusBadge.vue'
import { EVENT_STATUS_LABELS } from '../lib'

const session = useSessionStore()
const router = useRouter()
const { data: events, loading, error, load } = useLoader(listEvents)
const creating = ref(false)
const { sorted, toggle, directionOf } = useSort(events, {
  name: (event) => event.name,
  season: (event) => event.season,
  venue: (event) => event.venue,
  status: (event) => EVENT_STATUS_LABELS[event.status],
})

function onCreated(event: EventRecord) {
  // A new event opens its setup checklist (M8-20).
  router.push({ name: 'event', params: { id: event.id }, query: { tab: 'setup' } })
}

onMounted(load)
</script>

<template>
  <PageHeader :title="t('shell.nav.events')" :description="t('events.list.description')">
    <template #actions>
      <!-- M11-12: one New event dialog, empty or from a template. -->
      <Button v-if="session.isAdmin" @click="creating = true"
        ><PlusIcon /> {{ t('events.form.newTitle') }}</Button
      >
    </template>
  </PageHeader>
  <ErrorAlert :error="error" />
  <Table data-testid="event-list">
    <TableHeader>
      <TableRow>
        <SortableTableHead :direction="directionOf('name')" @toggle="toggle('name')">
          {{ t('events.event') }}
        </SortableTableHead>
        <SortableTableHead :direction="directionOf('season')" @toggle="toggle('season')">
          {{ t('events.season') }}
        </SortableTableHead>
        <SortableTableHead
          class="hidden sm:table-cell"
          :direction="directionOf('venue')"
          @toggle="toggle('venue')"
        >
          {{ t('events.venue') }}
        </SortableTableHead>
        <SortableTableHead :direction="directionOf('status')" @toggle="toggle('status')">
          {{ t('common.status') }}
        </SortableTableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="event in sorted" :key="event.id">
        <TableCell class="font-medium">
          <RouterLink :to="{ name: 'event', params: { id: event.id } }" class="hover:underline">
            {{ event.name }}
          </RouterLink>
        </TableCell>
        <TableCell>{{ event.season }}</TableCell>
        <TableCell class="hidden sm:table-cell">{{ event.venue || '–' }}</TableCell>
        <TableCell><EventStatusBadge :status="event.status" /></TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !events?.length" :colspan="4">{{
        t('events.list.empty')
      }}</TableEmpty>
    </TableBody>
  </Table>
  <NewEventDialog v-if="session.isAdmin" v-model:open="creating" @created="onCreated" />
</template>
