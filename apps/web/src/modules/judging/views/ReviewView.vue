<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Skeleton } from '@/components/ui/skeleton'
import { listEvents } from '@/modules/events/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import ReviewQueue from '../components/ReviewQueue.vue'

/**
 * The single place where head judges and event managers review score sheets (M5-11). It has
 * its own entry in the main navigation, so nobody has to remember which event tab or judging
 * tab the queue was hidden in.
 */
const session = useSessionStore()
const adminEvents = ref<{ id: string; name: string }[]>([])
const loading = ref(false)
const error = ref<AppError | null>(null)

const events = computed(() => {
  const seen = new Map(session.reviewEvents.map((e) => [e.id, e.name]))
  for (const e of adminEvents.value) if (!seen.has(e.id)) seen.set(e.id, e.name)
  return [...seen].map(([id, name]) => ({ id, name }))
})

onMounted(async () => {
  // Admins review every event that is still running, not only the ones they hold a role in.
  if (!session.isAdmin) return
  loading.value = true
  try {
    adminEvents.value = (await listEvents())
      .filter((e) => e.status !== 'archived')
      .map((e) => ({ id: e.id, name: e.name }))
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <PageHeader
    title="Review"
    description="Approve or return the score sheets judges have submitted."
  />
  <ErrorAlert :error="error" />
  <Skeleton v-if="loading" class="h-24 w-full" />
  <ReviewQueue v-else-if="events.length" :key="events.length" :events="events" />
  <p
    v-else
    class="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
    data-testid="no-review-events"
  >
    You do not review scores for any event.
  </p>
</template>
