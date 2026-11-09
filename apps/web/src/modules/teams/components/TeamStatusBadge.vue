<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { TeamStatus } from '@/shared/types/records'
import { TEAM_STATUS_LABELS } from '../lib'

defineProps<{ status: TeamStatus }>()

const variants = {
  draft: 'outline',
  submitted: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
} as const
</script>

<template>
  <Badge :variant="variants[status]" data-testid="team-status">{{
    TEAM_STATUS_LABELS[status]
  }}</Badge>
</template>
