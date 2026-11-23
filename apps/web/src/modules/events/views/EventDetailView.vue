<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import EventCategoriesTab from '@/modules/categories/components/EventCategoriesTab.vue'
import EventTeamsTab from '@/modules/teams/components/EventTeamsTab.vue'
import EventScheduleTab from '@/modules/scheduling/components/EventScheduleTab.vue'
import EventStaffTab from '@/modules/administration/components/EventStaffTab.vue'
import EventMessagesTab from '@/modules/communication/components/EventMessagesTab.vue'
import AuditLogTable from '@/modules/administration/components/AuditLogTable.vue'
import PublicationPanel from '@/modules/live/components/PublicationPanel.vue'
import EventSetupChecklist from '@/modules/templates/components/EventSetupChecklist.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import type { EventRecord } from '@/shared/types/records'
import CompetitionDays from '../components/CompetitionDays.vue'
import EventFrame from '../components/EventFrame.vue'
import { canSee, defaultTab, EVENT_TABS, eventAccess, type EventTab } from '../nav'

const props = defineProps<{ id: string }>()
const session = useSessionStore()
// Loaded by the frame, which also replaces it after Edit, Publish or Archive.
const event = ref<EventRecord>()
// The open section lives in the URL: a refresh or "back" returns to the same panel.
const { tab } = useQueryRefs({ tab: '' })
// M11-14: the Assignments tab was `schedule`; old links still open it.
watch(
  tab,
  (value) => {
    if (value === 'schedule') tab.value = 'assignments'
  },
  { immediate: true },
)

const access = computed(() => eventAccess(session, props.id, event.value?.status ?? ''))
const canManage = computed(() => access.value.canManage)
const isStaff = computed(() => access.value.isStaff)
// No `?tab=` opens the landing section (M11-21); a section this user cannot see, or an old
// link, opens the overview instead of nothing.
const visibleTab = computed<EventTab>(() => {
  const value = tab.value
  if (!value) return defaultTab(access.value)
  const known = (EVENT_TABS as readonly string[]).includes(value)
  return known && canSee(value as EventTab, access.value) ? (value as EventTab) : 'overview'
})
const archived = computed(() => event.value?.status === 'archived')

const frame = ref<InstanceType<typeof EventFrame>>()
const publishing = computed(() => !!frame.value?.publishing)
function requestPublish() {
  frame.value?.requestPublish()
}
</script>

<template>
  <EventFrame ref="frame" v-model:event="event" :event-id="id" :section="visibleTab">
    <template v-if="event">
      <div v-if="visibleTab === 'overview'" class="grid gap-4 md:grid-cols-2">
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
      </div>

      <EventSetupChecklist
        v-else-if="visibleTab === 'setup'"
        :event="event"
        :publishing="publishing"
        @publish="requestPublish"
      />

      <EventCategoriesTab
        v-else-if="visibleTab === 'categories'"
        :event="event"
        :editable="canManage && !archived"
      />

      <EventTeamsTab
        v-else-if="visibleTab === 'teams' && isStaff"
        :event="event"
        :can-manage="canManage && !archived"
      />

      <EventScheduleTab
        v-else-if="visibleTab === 'assignments' && isStaff"
        :event="event"
        :can-manage="canManage && !archived"
      />

      <PublicationPanel
        v-else-if="visibleTab === 'publication'"
        :event="event"
        :editable="!archived"
      />

      <EventMessagesTab
        v-else-if="visibleTab === 'messages'"
        :event="event"
        :editable="!archived"
      />

      <AuditLogTable v-else-if="visibleTab === 'activity'" :event-id="event.id" />

      <EventStaffTab v-else-if="visibleTab === 'staff'" :event="event" :editable="!archived" />
    </template>
  </EventFrame>
</template>
