<script setup lang="ts">
import { t } from '@/i18n'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { ArrowUpRightIcon } from '@lucide/vue'
import { useSessionStore } from '@/shared/auth/session'
import type { EventRecord } from '@/shared/types/records'
import { eventAccess, eventSections, type EventSection } from '../nav'

/**
 * Places of an event (M11-17): one row of links in four groups, the same on every page of the
 * event frame. Sections that are tabs of the event page and sections that are their own page
 * (planner, print center) look and behave alike.
 */
const props = defineProps<{ event: EventRecord; section: EventSection }>()
const session = useSessionStore()

const access = computed(() => eventAccess(session, props.event.id, props.event.status))
const groups = computed(() => eventSections(access.value))

function target(key: EventSection): RouteLocationRaw {
  const params = { id: props.event.id }
  if (key === 'planner') return { name: 'event-planner', params }
  if (key === 'print') return { name: 'event-print', params }
  return { name: 'event', params, query: { tab: key } }
}
function label(key: EventSection): string {
  if (key === 'setup') return t('templates.setup.title')
  if (key === 'planner')
    return access.value.canManage && access.value.status !== 'archived'
      ? t('events.detail.planner')
      : t('events.tabs.schedule')
  if (key === 'print') return t('events.nav.print')
  return t(`events.tabs.${key}`)
}

interface Outbound {
  key: string
  to: RouteLocationRaw
  label: string
}
const outbound = computed(() => {
  const a = access.value
  const links: Outbound[] = []
  if (a.canReview && a.status !== 'archived')
    links.push({
      key: 'review',
      to: { name: 'review', query: { event: props.event.id } },
      label: t('events.detail.reviewScores'),
    })
  if (a.status !== 'draft')
    links.push({
      key: 'live',
      to: { name: 'live-event', params: { id: props.event.id } },
      label: t('shell.nav.live'),
    })
  return links
})

// On narrow screens the row scrolls; keep the current place in view.
const row = ref<HTMLElement>()
async function revealCurrent() {
  await nextTick()
  const el = row.value?.querySelector<HTMLElement>('[aria-current="page"]')
  el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}
onMounted(revealCurrent)
watch(() => props.section, revealCurrent)

const linkClass =
  'inline-flex h-10 shrink-0 items-center gap-1 border-b-2 border-transparent px-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const currentClass = '!border-foreground font-medium !text-foreground'
</script>

<template>
  <nav
    :aria-label="t('events.nav.label')"
    data-testid="event-nav"
    class="mb-6 border-b print:hidden"
  >
    <div ref="row" class="-mb-px flex items-center overflow-x-auto">
      <template v-for="(group, gi) in groups" :key="gi">
        <span v-if="gi" class="mx-1.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
        <RouterLink
          v-for="key in group"
          :key="key"
          :to="target(key)"
          :data-section="key"
          :aria-current="key === section ? 'page' : undefined"
          :class="[linkClass, key === section && currentClass]"
          >{{ label(key) }}</RouterLink
        >
      </template>
      <span class="min-w-4 flex-1" aria-hidden="true" />
      <RouterLink
        v-for="link in outbound"
        :key="link.key"
        :to="link.to"
        :data-outbound="link.key"
        :class="linkClass"
        >{{ link.label }} <ArrowUpRightIcon class="size-3.5" aria-hidden="true"
      /></RouterLink>
    </div>
  </nav>
</template>
