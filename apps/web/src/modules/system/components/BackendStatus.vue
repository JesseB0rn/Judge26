<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RefreshCwIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toAppError, type AppError } from '@/shared/api/errors'
import { config } from '@/shared/config/env'
import { fetchAppInfo, type AppInfo } from '../api'

const info = ref<AppInfo | null>(null)
const error = ref<AppError | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    info.value = await fetchAppInfo()
  } catch (e) {
    info.value = null
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
        Backend
        <Badge v-if="info" data-testid="backend-status-badge">online</Badge>
        <Badge v-else-if="error" variant="destructive" data-testid="backend-status-badge">
          offline
        </Badge>
        <Badge v-else variant="secondary" data-testid="backend-status-badge">checking…</Badge>
      </CardTitle>
      <CardDescription>{{ config.pocketbaseUrl }}</CardDescription>
    </CardHeader>
    <CardContent class="flex items-center justify-between gap-4 text-sm">
      <p v-if="info" class="text-muted-foreground">
        Environment: <span class="font-medium text-foreground">{{ info.environment }}</span>
      </p>
      <p v-else-if="error" class="text-destructive" role="alert">{{ error.message }}</p>
      <p v-else class="text-muted-foreground">Contacting server…</p>
      <Button variant="outline" size="sm" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" />
        Retry
      </Button>
    </CardContent>
  </Card>
</template>
