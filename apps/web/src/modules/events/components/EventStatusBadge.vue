<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { EventStatus } from '@/shared/types/records'
import { EVENT_STATUS_LABELS } from '../lib'

defineProps<{ status: EventStatus }>()
</script>

<template>
  <Badge
    :variant="status === 'published' ? 'default' : status === 'draft' ? 'outline' : 'secondary'"
  >
    {{ EVENT_STATUS_LABELS[status] }}
  </Badge>
</template>
