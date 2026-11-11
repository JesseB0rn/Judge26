<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import { listPublicEvents } from '../api'

/** Public entry point: events with live results and schedules (M6-03). */
const { data: events, loading, error, load } = useLoader(listPublicEvents)
onMounted(load)
</script>

<template>
  <PageHeader :title="t('shell.nav.live')" :description="t('live.events.description')" />
  <ErrorAlert :error="error" />
  <Skeleton v-if="loading && !events" class="h-24 w-full" />
  <p v-else-if="events && !events.length" class="text-muted-foreground">
    {{ t('live.events.empty') }}
  </p>
  <div v-else class="grid gap-4 md:grid-cols-2">
    <RouterLink
      v-for="event in events"
      :key="event.id"
      :to="{ name: 'live-event', params: { id: event.id } }"
      class="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      :data-event="event.id"
    >
      <Card class="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle>{{ event.name }}</CardTitle>
        </CardHeader>
        <CardContent class="text-sm text-muted-foreground">
          {{ t('events.detail.seasonLine', { season: event.season })
          }}<template v-if="event.venue"> · {{ event.venue }}</template>
          <template v-if="event.days.length">
            · {{ formatDay(event.days[0]!.date) }}
            <template v-if="event.days.length > 1">
              – {{ formatDay(event.days[event.days.length - 1]!.date) }}</template
            >
          </template>
          <span v-if="event.status === 'archived'"> · {{ t('live.events.finished') }}</span>
        </CardContent>
      </Card>
    </RouterLink>
  </div>
</template>
