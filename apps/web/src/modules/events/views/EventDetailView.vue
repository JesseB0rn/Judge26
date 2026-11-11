<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarRangeIcon,
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  RadioIcon,
  SendIcon,
} from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import EventCategoriesTab from '@/modules/categories/components/EventCategoriesTab.vue'
import EventTeamsTab from '@/modules/teams/components/EventTeamsTab.vue'
import EventScheduleTab from '@/modules/scheduling/components/EventScheduleTab.vue'
import EventStaffTab from '@/modules/administration/components/EventStaffTab.vue'
import EventMessagesTab from '@/modules/communication/components/EventMessagesTab.vue'
import PublicationPanel from '@/modules/live/components/PublicationPanel.vue'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import { formatDateTime } from '@/shared/format'
import type { EventRecord, EventStatus } from '@/shared/types/records'
import { getEvent, updateEvent } from '../api'
import { isRegistrationOpen, registrationSummary } from '../lib'
import CompetitionDays from '../components/CompetitionDays.vue'
import EventFormDialog from '../components/EventFormDialog.vue'
import EventStatusBadge from '../components/EventStatusBadge.vue'

const props = defineProps<{ id: string }>()
const session = useSessionStore()
const { data: event, loading, error, load } = useLoader(() => getEvent(props.id))
const editing = ref(false)
// The open tab lives in the URL: a refresh or "back" returns to the same panel.
const { tab } = useQueryRefs({ tab: 'overview' })

const canManage = computed(() => session.canManageEvent(props.id))
const isStaff = computed(() => session.isEventStaff(props.id))
const canReview = computed(
  () => canManage.value || session.rolesFor(props.id).includes('head_judge'),
)
// A link to a tab this user cannot see (or an old one) opens the overview instead of nothing.
const visibleTab = computed(() => {
  const allowed: Record<string, boolean> = {
    overview: true,
    categories: true,
    teams: true,
    schedule: isStaff.value,
    publication: canManage.value,
    messages: canManage.value,
    staff: session.isAdmin,
  }
  return allowed[tab.value] ? tab.value : 'overview'
})
const archived = computed(() => event.value?.status === 'archived')
const registrationOpen = computed(() => !!event.value && isRegistrationOpen(event.value))

const setStatus = useSubmit(
  async (status: EventStatus) => {
    event.value = await updateEvent(props.id, { status })
  },
  { success: 'Event updated.' },
)

function onSaved(saved: EventRecord) {
  event.value = saved
}

onMounted(load)
watch(() => props.id, load)
</script>

<template>
  <ErrorAlert :error="error" />
  <Skeleton v-if="loading && !event" class="h-10 w-1/2" />
  <template v-if="event">
    <PageHeader
      :title="event.name"
      :description="`Season ${event.season}${event.venue ? ' · ' + event.venue : ''}`"
    >
      <template #actions>
        <EventStatusBadge :status="event.status" class="self-center" />
        <template v-if="canManage">
          <Button v-if="!archived" variant="outline" @click="editing = true"
            ><PencilIcon /> Edit</Button
          >
          <Button v-if="event.status === 'draft'" @click="setStatus.run('published')">
            <SendIcon /> Publish
          </Button>
          <Button v-if="!archived" variant="outline" @click="setStatus.run('archived')">
            <ArchiveIcon /> Archive
          </Button>
          <Button v-else variant="outline" @click="setStatus.run('published')">
            <ArchiveRestoreIcon /> Restore
          </Button>
        </template>
        <Button v-if="canReview && !archived" as-child variant="outline">
          <RouterLink :to="{ name: 'review', query: { event: event.id } }">
            <ClipboardListIcon /> Review scores
          </RouterLink>
        </Button>
        <Button v-if="isStaff || event.status !== 'draft'" as-child variant="outline">
          <RouterLink :to="{ name: 'event-planner', params: { id: event.id } }">
            <CalendarRangeIcon /> {{ canManage && !archived ? 'Planner' : 'Schedule' }}
          </RouterLink>
        </Button>
        <Button v-if="event.status !== 'draft'" as-child variant="outline">
          <RouterLink :to="{ name: 'live-event', params: { id: event.id } }">
            <RadioIcon /> Live results
          </RouterLink>
        </Button>
        <Button v-if="registrationOpen" as-child>
          <RouterLink :to="{ name: 'team-new', params: { eventId: event.id } }">
            <PlusIcon /> Register a team
          </RouterLink>
        </Button>
      </template>
    </PageHeader>

    <ErrorAlert :error="setStatus.error.value" />
    <Alert v-if="archived" class="mb-4">
      <AlertDescription>This event is archived. Its records are read-only.</AlertDescription>
    </Alert>

    <Tabs :model-value="visibleTab" @update:model-value="tab = String($event)">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="categories">Categories</TabsTrigger>
        <TabsTrigger value="teams">Teams</TabsTrigger>
        <TabsTrigger v-if="isStaff" value="schedule">Schedule</TabsTrigger>
        <TabsTrigger v-if="canManage" value="publication">Public results</TabsTrigger>
        <TabsTrigger v-if="canManage" value="messages">Messages</TabsTrigger>
        <TabsTrigger v-if="session.isAdmin" value="staff">Staff</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" class="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent class="flex flex-col gap-2 text-sm">
            <p v-if="event.description" class="whitespace-pre-line">{{ event.description }}</p>
            <p>
              <span class="text-muted-foreground">Registration:</span>
              {{ registrationSummary(event) }}
            </p>
            <p>
              <span class="text-muted-foreground">Opens:</span>
              {{ formatDateTime(event.registration_opens_at) }} ·
              <span class="text-muted-foreground">Closes:</span>
              {{ formatDateTime(event.registration_closes_at) }}
            </p>
          </CardContent>
        </Card>
        <CompetitionDays :event-id="event.id" :editable="canManage && !archived" />
      </TabsContent>

      <TabsContent value="categories">
        <EventCategoriesTab :event="event" :editable="canManage && !archived" />
      </TabsContent>

      <TabsContent value="teams">
        <EventTeamsTab :event="event" :staff="isStaff" :can-manage="canManage && !archived" />
      </TabsContent>

      <TabsContent v-if="isStaff" value="schedule">
        <EventScheduleTab :event="event" :can-manage="canManage && !archived" />
      </TabsContent>

      <TabsContent v-if="canManage" value="publication">
        <PublicationPanel :event="event" :editable="!archived" />
      </TabsContent>

      <TabsContent v-if="canManage" value="messages">
        <EventMessagesTab :event="event" :editable="!archived" />
      </TabsContent>

      <TabsContent v-if="session.isAdmin" value="staff">
        <EventStaffTab :event="event" />
      </TabsContent>
    </Tabs>

    <EventFormDialog v-model:open="editing" :event="event" @saved="onSaved" />
  </template>
</template>
