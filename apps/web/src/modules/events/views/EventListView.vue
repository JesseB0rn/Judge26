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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useLoader } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import { listEvents } from '../api'
import NewEventDialog from '../components/NewEventDialog.vue'
import EventStatusBadge from '../components/EventStatusBadge.vue'

const session = useSessionStore()
const router = useRouter()
const { data: events, loading, error, load } = useLoader(listEvents)
const creating = ref(false)

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
        <TableHead>{{ t('events.event') }}</TableHead>
        <TableHead>{{ t('events.season') }}</TableHead>
        <TableHead class="hidden sm:table-cell">{{ t('events.venue') }}</TableHead>
        <TableHead>{{ t('common.status') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="event in events" :key="event.id">
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
