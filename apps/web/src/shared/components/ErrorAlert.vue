<script setup lang="ts">
import { CircleAlertIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { AppError } from '@/shared/api/errors'

defineProps<{ error: AppError | null | undefined }>()
</script>

<template>
  <Alert v-if="error" variant="destructive" role="alert">
    <CircleAlertIcon />
    <AlertDescription>{{ error.message }}</AlertDescription>
  </Alert>
</template>
