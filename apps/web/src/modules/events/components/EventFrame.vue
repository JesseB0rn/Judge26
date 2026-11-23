<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EllipsisIcon,
  LibraryIcon,
  PencilIcon,
  SendIcon,
} from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import SaveTemplateDialog from '@/modules/templates/components/SaveTemplateDialog.vue'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { EventRecord, EventStatus } from '@/shared/types/records'
import { getEvent, updateEvent } from '../api'
import type { EventSection } from '../nav'
import EventFormDialog from './EventFormDialog.vue'
import EventNav from './EventNav.vue'
import EventStatusBadge from './EventStatusBadge.vue'
import PublishDialog from './PublishDialog.vue'

/**
 * The event frame (M11-15): the event's header (actions only, M11-16) and its navigation
 * (places only, M11-17) on every page of an event: its tabs, the planner, the print center and
 * a category's pages. Pass `event` when the page has the full record; otherwise it is loaded.
 * Either way `update:event` reports the record as loaded and after every change.
 */
const props = defineProps<{ eventId: string; event?: EventRecord; section: EventSection }>()
const emit = defineEmits<{ 'update:event': [event: EventRecord] }>()
const session = useSessionStore()
const route = useRoute()

const current = ref<EventRecord | undefined>(props.event)
const loadError = ref<AppError | null>(null)
watch(
  () => props.event,
  (e) => {
    if (e) current.value = e
  },
)
watch(
  () => props.eventId,
  async (id) => {
    if (props.event?.id === id) return
    try {
      current.value = await getEvent(id)
      loadError.value = null
      emit('update:event', current.value)
    } catch (error) {
      loadError.value = toAppError(error)
    }
  },
  { immediate: true },
)

const canManage = computed(() => session.canManageEvent(props.eventId))
const archived = computed(() => current.value?.status === 'archived')
// The event page names the event in its title; the other pages link back to it.
const onEventPage = computed(() => route.name === 'event')

function onSaved(saved: EventRecord) {
  current.value = saved
  emit('update:event', saved)
}

const setStatus = useSubmit(
  async (status: EventStatus) => {
    onSaved(await updateEvent(props.eventId, { status }))
  },
  { success: () => t('events.detail.updated') },
)

// M11-13: Publish (header and checklist) asks first while the setup is incomplete.
const publishDialog = ref<InstanceType<typeof PublishDialog>>()
const publishing = computed(() => setStatus.pending.value || !!publishDialog.value?.checking)
function requestPublish() {
  void publishDialog.value?.start()
}

const editing = ref(false)
const savingTemplate = ref(false)

defineExpose({ requestPublish, publishing })
</script>

<template>
  <ErrorAlert :error="loadError" />
  <Skeleton v-if="!current && !loadError" class="mb-6 h-10 w-1/2 print:hidden" />
  <template v-if="current">
    <header class="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 print:hidden">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">
          <RouterLink
            v-if="!onEventPage"
            :to="{ name: 'event', params: { id: current.id } }"
            class="hover:underline"
            data-testid="event-title-link"
            >{{ current.name }}</RouterLink
          >
          <template v-else>{{ current.name }}</template>
        </h1>
        <p class="text-muted-foreground">
          {{
            t('events.detail.seasonLine', { season: current.season }) +
            (current.venue ? ' · ' + current.venue : '')
          }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <EventStatusBadge :status="current.status" />
        <template v-if="canManage">
          <Button
            v-if="current.status === 'draft'"
            :disabled="publishing"
            data-testid="header-publish"
            @click="requestPublish"
          >
            <SendIcon /> {{ t('events.detail.publish') }}
          </Button>
          <Button
            v-if="!archived"
            variant="outline"
            :aria-label="t('common.edit')"
            @click="editing = true"
            ><PencilIcon /> <span class="hidden sm:inline">{{ t('common.edit') }}</span></Button
          >
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                :aria-label="t('events.detail.more')"
                data-testid="event-more"
                ><EllipsisIcon />
                <span class="hidden sm:inline">{{ t('events.detail.more') }}</span></Button
              >
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @select="savingTemplate = true">
                <LibraryIcon /> {{ t('templates.save.button') }}
              </DropdownMenuItem>
              <DropdownMenuItem v-if="!archived" @select="setStatus.run('archived')">
                <ArchiveIcon /> {{ t('events.detail.archive') }}
              </DropdownMenuItem>
              <DropdownMenuItem v-else @select="setStatus.run('published')">
                <ArchiveRestoreIcon /> {{ t('events.detail.restore') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </div>
    </header>

    <ErrorAlert :error="setStatus.error.value" />
    <Alert v-if="archived" class="mb-4 print:hidden">
      <AlertDescription>{{ t('events.detail.archivedNotice') }}</AlertDescription>
    </Alert>

    <EventNav :event="current" :section="section" />

    <template v-if="canManage">
      <EventFormDialog v-model:open="editing" :event="current" @saved="onSaved" />
      <PublishDialog
        ref="publishDialog"
        :event="current"
        :publishing="setStatus.pending.value"
        @publish="setStatus.run('published')"
      />
      <SaveTemplateDialog v-model:open="savingTemplate" :event="current" />
    </template>
  </template>
  <slot :event="current" />
</template>
