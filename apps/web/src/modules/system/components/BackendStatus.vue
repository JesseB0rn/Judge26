<script setup lang="ts">
import { t, translatedLabels } from '@/i18n'
import { onMounted, ref } from 'vue'
import { RefreshCwIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toAppError, type AppError } from '@/shared/api/errors'
import { config } from '@/shared/config/env'
import { fetchAppInfo, fetchHealth, type AppInfo, type HealthStatus } from '../api'

const info = ref<AppInfo | null>(null)
const health = ref<HealthStatus | null>(null)
const HEALTH = translatedLabels<HealthStatus>(['ok', 'degraded', 'down'], (s) =>
  t(`system.status.health.${s}`),
)
const error = ref<AppError | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    info.value = await fetchAppInfo()
    // Extra information: without it the server still shows as online.
    health.value = await fetchHealth().catch(() => null)
  } catch (e) {
    info.value = null
    health.value = null
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <Card data-testid="backend-status">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        {{ t('system.status.backend') }}
        <Badge v-if="info" data-testid="backend-status-badge">{{
          t('system.status.online')
        }}</Badge>
        <Badge v-else-if="error" variant="destructive" data-testid="backend-status-badge">
          {{ t('system.status.offline') }}
        </Badge>
        <Badge v-else variant="secondary" data-testid="backend-status-badge">{{
          t('system.status.checking')
        }}</Badge>
      </CardTitle>
      <CardDescription>{{ config.pocketbaseUrl }}</CardDescription>
    </CardHeader>
    <CardContent class="flex items-center justify-between gap-4 text-sm">
      <p v-if="info" class="text-muted-foreground">
        {{ t('system.status.environment') }}
        <span class="font-medium text-foreground">{{ info.environment }}</span>
        <template v-if="info.version">
          · {{ t('system.status.version') }}
          <span class="font-medium text-foreground" data-testid="backend-version"
            >{{ info.version
            }}<template v-if="info.commit && info.commit !== 'unknown'">
              ({{ info.commit.slice(0, 7) }})</template
            ></span
          >
        </template>
        <template v-if="health">
          · {{ t('system.status.healthLabel') }}
          <span
            class="font-medium"
            :class="health === 'ok' ? 'text-foreground' : 'text-destructive'"
            data-testid="backend-health"
            >{{ HEALTH[health] }}</span
          >
        </template>
      </p>
      <p v-else-if="error" class="text-destructive" role="alert">{{ error.message }}</p>
      <p v-else class="text-muted-foreground">{{ t('system.status.contacting') }}</p>
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" />
        {{ t('common.retry') }}
      </Button>
    </CardContent>
  </Card>
</template>
