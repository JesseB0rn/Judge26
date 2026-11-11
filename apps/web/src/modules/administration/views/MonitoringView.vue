<script setup lang="ts">
import { t, te } from '@/i18n'
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
import {
  fetchMonitoring,
  type CheckStatus,
  type HealthCheck,
  type HealthStatus,
  type Monitoring,
} from '../api'

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

const OVERALL: Record<HealthStatus, 'default' | 'secondary' | 'destructive'> = {
  ok: 'default',
  degraded: 'secondary',
  down: 'destructive',
}
const CHECK: Record<CheckStatus, 'outline' | 'secondary' | 'destructive'> = {
  ok: 'outline',
  warn: 'secondary',
  down: 'destructive',
}

/** The check's result in the current language; the server's English text for unknown codes. */
function checkDetail(check: HealthCheck): string {
  if (!check.messages?.length) return check.detail
  const parts = check.messages.map((m) => {
    const key = `administration.monitoring.detail.${m.code}`
    if (!te(key)) return ''
    const count = m.params.count
    return typeof count === 'number' ? t(key, count, m.params) : t(key, m.params)
  })
  return parts.every(Boolean) ? parts.join('; ') : check.detail
}

const uptime = computed(() => {
  if (!data.value) return ''
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(data.value.checked_at) - Date.parse(data.value.started_at)) / 60000),
  )
  if (minutes < 60) return t('administration.monitoring.uptime.minutes', { minutes })
  const hours = Math.floor(minutes / 60)
  return hours < 48
    ? t('administration.monitoring.uptime.hours', { hours, minutes: minutes % 60 })
    : t('administration.monitoring.uptime.days', Math.floor(hours / 24))
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
    :title="t('shell.nav.monitoring')"
    :description="t('administration.monitoring.description')"
  >
    <template #actions>
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" />
        {{ t('common.refresh') }}
      </Button>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-6">
    <ErrorAlert :error="error" />

    <template v-if="data">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid="health-summary">
        <Badge :variant="OVERALL[data.status]" data-testid="health-status">
          {{ t(`administration.monitoring.overall.${data.status}`) }}
        </Badge>
        <span class="text-muted-foreground">
          {{ t('system.status.version') }}
          <span class="font-medium text-foreground">{{ data.version }}</span>
          <template v-if="data.commit !== 'unknown'"> ({{ data.commit.slice(0, 7) }})</template>
          ·
          {{
            t('administration.monitoring.upChecked', {
              uptime,
              checked: formatDateTime(data.checked_at),
            })
          }}
        </span>
        <span v-if="!data.alerts" class="text-muted-foreground" data-testid="alerts-off">
          · {{ t('administration.monitoring.alertsOff') }}
        </span>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <Card v-for="check in data.checks" :key="check.id" :data-testid="`check-${check.id}`">
          <CardHeader>
            <CardTitle class="flex items-center justify-between gap-2">
              {{ t(`administration.monitoring.checks.${check.id}`) }}
              <Badge :variant="CHECK[check.status]">{{
                t(`administration.monitoring.checkStatus.${check.status}`)
              }}</Badge>
            </CardTitle>
            <CardDescription>{{ checkDetail(check) }}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-lg font-semibold">{{ t('administration.monitoring.recentErrors') }}</h2>
          <a
            :href="logsUrl"
            target="_blank"
            rel="noopener"
            class="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >{{ t('administration.monitoring.allLogs') }}</a
          >
        </div>
        <Card>
          <CardContent class="px-0">
            <Table data-testid="recent-errors">
              <TableHeader>
                <TableRow>
                  <TableHead class="w-40">{{ t('administration.monitoring.time') }}</TableHead>
                  <TableHead class="w-24">{{ t('administration.monitoring.source') }}</TableHead>
                  <TableHead>{{ t('administration.monitoring.error') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-for="entry in data.recent_errors" :key="entry.id">
                  <TableRow class="cursor-pointer align-top" @click="toggle(entry.id)">
                    <TableCell class="whitespace-nowrap text-muted-foreground">
                      {{ formatDateTime(entry.created) }}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{{
                        t(`administration.monitoring.sources.${entry.source}`)
                      }}</Badge>
                    </TableCell>
                    <TableCell class="break-all whitespace-normal">
                      <div class="font-medium">{{ entry.message }}</div>
                      <div v-if="entry.url" class="text-xs text-muted-foreground">
                        {{ entry.url
                        }}<template v-if="entry.status !== null">
                          ·
                          {{
                            t('administration.monitoring.httpStatus', { status: entry.status })
                          }}</template
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
                  {{ t('administration.monitoring.noErrors') }}
                </TableEmpty>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </template>
  </div>
</template>
