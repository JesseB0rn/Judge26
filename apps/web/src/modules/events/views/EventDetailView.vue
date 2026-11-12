<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarRangeIcon,
  ClipboardListIcon,
  LibraryIcon,
  PencilIcon,
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
import AuditLogTable from '@/modules/administration/components/AuditLogTable.vue'
import PublicationPanel from '@/modules/live/components/PublicationPanel.vue'
import EventSetupChecklist from '@/modules/templates/components/EventSetupChecklist.vue'
import SaveTemplateDialog from '@/modules/templates/components/SaveTemplateDialog.vue'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import type { EventRecord, EventStatus } from '@/shared/types/records'
import { getEvent, updateEvent } from '../api'
import CompetitionDays from '../components/CompetitionDays.vue'
import EventFormDialog from '../components/EventFormDialog.vue'
import EventStatusBadge from '../components/EventStatusBadge.vue'

const props = defineProps<{ id: string }>()
const session = useSessionStore()
const { data: event, loading, error, load } = useLoader(() => getEvent(props.id))
const editing = ref(false)
const savingTemplate = ref(false)
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
    setup: canManage.value,
    categories: true,
    teams: isStaff.value,
    schedule: isStaff.value,
    publication: canManage.value,
    messages: canManage.value,
    activity: canManage.value,
    staff: canManage.value,
  }
  return allowed[tab.value] ? tab.value : 'overview'
})
const archived = computed(() => event.value?.status === 'archived')

const setStatus = useSubmit(
  async (status: EventStatus) => {
    event.value = await updateEvent(props.id, { status })
  },
  { success: () => t('events.detail.updated') },
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
      :description="
        t('events.detail.seasonLine', { season: event.season }) +
        (event.venue ? ' · ' + event.venue : '')
      "
    >
      <template #actions>
        <EventStatusBadge :status="event.status" class="self-center" />
        <template v-if="canManage">
          <Button v-if="!archived" variant="outline" @click="editing = true"
            ><PencilIcon /> {{ t('common.edit') }}</Button
          >
          <Button v-if="event.status === 'draft'" @click="setStatus.run('published')">
            <SendIcon /> {{ t('events.detail.publish') }}
          </Button>
          <Button variant="outline" @click="savingTemplate = true">
            <LibraryIcon /> {{ t('templates.save.button') }}
          </Button>
          <Button v-if="!archived" variant="outline" @click="setStatus.run('archived')">
            <ArchiveIcon /> {{ t('events.detail.archive') }}
          </Button>
          <Button v-else variant="outline" @click="setStatus.run('published')">
            <ArchiveRestoreIcon /> {{ t('events.detail.restore') }}
          </Button>
        </template>
        <Button v-if="canReview && !archived" as-child variant="outline">
          <RouterLink :to="{ name: 'review', query: { event: event.id } }">
            <ClipboardListIcon /> {{ t('events.detail.reviewScores') }}
          </RouterLink>
        </Button>
        <Button v-if="isStaff || event.status !== 'draft'" as-child variant="outline">
          <RouterLink :to="{ name: 'event-planner', params: { id: event.id } }">
            <CalendarRangeIcon />
            {{ canManage && !archived ? t('events.detail.planner') : t('events.tabs.schedule') }}
          </RouterLink>
        </Button>
        <Button v-if="event.status !== 'draft'" as-child variant="outline">
          <RouterLink :to="{ name: 'live-event', params: { id: event.id } }">
            <RadioIcon /> {{ t('shell.nav.live') }}
          </RouterLink>
        </Button>
      </template>
    </PageHeader>

    <ErrorAlert :error="setStatus.error.value" />
    <Alert v-if="archived" class="mb-4">
      <AlertDescription>{{ t('events.detail.archivedNotice') }}</AlertDescription>
    </Alert>

    <Tabs :model-value="visibleTab" @update:model-value="tab = String($event)">
      <TabsList>
        <TabsTrigger value="overview">{{ t('events.tabs.overview') }}</TabsTrigger>
        <TabsTrigger v-if="canManage" value="setup">{{ t('templates.setup.title') }}</TabsTrigger>
        <TabsTrigger value="categories">{{ t('events.tabs.categories') }}</TabsTrigger>
        <TabsTrigger v-if="isStaff" value="teams">{{ t('events.tabs.teams') }}</TabsTrigger>
        <TabsTrigger v-if="isStaff" value="schedule">{{
          t('events.tabs.assignments')
        }}</TabsTrigger>
        <TabsTrigger v-if="canManage" value="publication">{{
          t('events.tabs.publication')
        }}</TabsTrigger>
        <TabsTrigger v-if="canManage" value="messages">{{ t('events.tabs.messages') }}</TabsTrigger>
        <TabsTrigger v-if="canManage" value="activity">{{ t('events.tabs.activity') }}</TabsTrigger>
        <TabsTrigger v-if="canManage" value="staff">{{ t('events.tabs.staff') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" class="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            ><CardTitle>{{ t('events.detail.details') }}</CardTitle></CardHeader
          >
          <CardContent class="flex flex-col gap-2 text-sm">
            <p v-if="event.description" class="whitespace-pre-line">{{ event.description }}</p>
            <p>
              <span class="text-muted-foreground">{{ t('events.season') }}</span>
              {{ event.season }}
            </p>
            <p v-if="event.venue">
              <span class="text-muted-foreground">{{ t('events.venue') }}</span>
              {{ event.venue }}
            </p>
          </CardContent>
        </Card>
        <CompetitionDays :event-id="event.id" :editable="canManage && !archived" />
      </TabsContent>

      <TabsContent v-if="canManage" value="setup">
        <EventSetupChecklist :event="event" />
      </TabsContent>

      <TabsContent value="categories">
        <EventCategoriesTab :event="event" :editable="canManage && !archived" />
      </TabsContent>

      <TabsContent v-if="isStaff" value="teams">
        <EventTeamsTab :event="event" :can-manage="canManage && !archived" />
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

      <TabsContent v-if="canManage" value="activity">
        <AuditLogTable :event-id="event.id" />
      </TabsContent>

      <TabsContent v-if="canManage" value="staff">
        <EventStaffTab :event="event" :editable="!archived" />
      </TabsContent>
    </Tabs>

    <EventFormDialog v-model:open="editing" :event="event" @saved="onSaved" />
    <SaveTemplateDialog v-if="canManage" v-model:open="savingTemplate" :event="event" />
  </template>
</template>
