<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { RefreshCwIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { toAppError, type AppError } from '@/shared/api/errors'
import { config } from '@/shared/config/env'
import { formatDateTime } from '@/shared/format'
import { fetchMonitoring, type CheckStatus, type HealthStatus, type Monitoring } from '../api'

/** System health (M7-13): health checks and recent errors, refreshed every 30 seconds. */
const data = ref<Monitoring | null>(null)
const error = ref<AppError>()
const loading = ref(false)
const open = ref(new Set<string>())

async function load() {
  loading.value = true
  try {
    data.value = await fetchMonitoring()
    error.value = undefined
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
useIntervalFn(load, 30_000)

const OVERALL: Record<
  HealthStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' }
> = {
  ok: { label: 'All systems normal', variant: 'default' },
  degraded: { label: 'Needs attention', variant: 'secondary' },
  down: { label: 'Down', variant: 'destructive' },
}
const CHECK: Record<
  CheckStatus,
  { label: string; variant: 'outline' | 'secondary' | 'destructive' }
> = {
  ok: { label: 'OK', variant: 'outline' },
  warn: { label: 'Warning', variant: 'secondary' },
  down: { label: 'Down', variant: 'destructive' },
}

const uptime = computed(() => {
  if (!data.value) return ''
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(data.value.checked_at) - Date.parse(data.value.started_at)) / 60000),
  )
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} days`
})

/** The PocketBase dashboard's logs (superusers only). */
const logsUrl = computed(() => `${config.pocketbaseUrl.replace(/\/+$/, '')}/_/#/logs`)

function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}
</script>

<template>
  <PageHeader
    title="System health"
    description="Whether the server, email delivery and backups are working, and the latest errors. Refreshed every 30 seconds."
  >
    <template #actions>
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" />
        Refresh
      </Button>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-6">
    <ErrorAlert :error="error" />

    <template v-if="data">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid="health-summary">
        <Badge :variant="OVERALL[data.status].variant" data-testid="health-status">
          {{ OVERALL[data.status].label }}
        </Badge>
        <span class="text-muted-foreground">
          Version <span class="font-medium text-foreground">{{ data.version }}</span>
          <template v-if="data.commit !== 'unknown'"> ({{ data.commit.slice(0, 7) }})</template>
          · up {{ uptime }} · checked {{ formatDateTime(data.checked_at) }}
        </span>
        <span v-if="!data.alerts" class="text-muted-foreground" data-testid="alerts-off">
          · Email alerts are off (MONITORING_ALERT_EMAIL)
        </span>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <Card v-for="check in data.checks" :key="check.id" :data-testid="`check-${check.id}`">
          <CardHeader>
            <CardTitle class="flex items-center justify-between gap-2">
              {{ check.label }}
              <Badge :variant="CHECK[check.status].variant">{{ CHECK[check.status].label }}</Badge>
            </CardTitle>
            <CardDescription>{{ check.detail }}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-semibold">Recent errors</h2>
          <a
            :href="logsUrl"
            target="_blank"
            rel="noopener"
            class="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >All logs (dashboard, superusers)</a
          >
        </div>
        <Card>
          <CardContent class="px-0">
            <Table data-testid="recent-errors">
              <TableHeader>
                <TableRow>
                  <TableHead class="w-40">Time</TableHead>
                  <TableHead class="w-24">Source</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-for="entry in data.recent_errors" :key="entry.id">
                  <TableRow class="cursor-pointer align-top" @click="toggle(entry.id)">
                    <TableCell class="whitespace-nowrap text-muted-foreground">
                      {{ formatDateTime(entry.created) }}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{{ entry.source }}</Badge>
                    </TableCell>
                    <TableCell class="break-all whitespace-normal">
                      <div class="font-medium">{{ entry.message }}</div>
                      <div v-if="entry.url" class="text-xs text-muted-foreground">
                        {{ entry.url
                        }}<template v-if="entry.status !== null">
                          · status {{ entry.status }}</template
                        >
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow v-if="open.has(entry.id) && entry.detail">
                    <TableCell colspan="3">
                      <pre class="max-h-64 overflow-auto text-xs whitespace-pre-wrap">{{
                        entry.detail
                      }}</pre>
                    </TableCell>
                  </TableRow>
                </template>
                <TableEmpty v-if="!data.recent_errors.length" :colspan="3">
                  No errors in the last 24 hours.
                </TableEmpty>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </template>
  </div>
</template>
