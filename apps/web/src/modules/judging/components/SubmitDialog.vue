<script setup lang="ts">
import { SendIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatTime } from '../lib'
import type { Outcome } from '../types'

/** Final check before submission: the judge reads the result back to the team. */
defineProps<{
  team: string
  context: string
  outcome: Outcome
  total: number | null
  timeMs: number
  busy?: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()

const OUTCOME_LABELS: Record<Outcome, string> = {
  completed: 'Scored',
  disqualified: 'Disqualified',
  absent: 'Absent (did not start)',
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Submit score for {{ team }}?</DialogTitle>
        <DialogDescription
          >Read the result back to the team. After submitting, only a head judge can change
          it.</DialogDescription
        >
      </DialogHeader>
      <dl
        class="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2"
        data-testid="submit-summary"
      >
        <dt class="text-sm text-muted-foreground">Game</dt>
        <dd class="text-sm">{{ context }}</dd>
        <dt class="text-sm text-muted-foreground">Result</dt>
        <dd class="font-medium">{{ OUTCOME_LABELS[outcome] }}</dd>
        <template v-if="outcome === 'completed'">
          <dt class="text-sm text-muted-foreground">Time</dt>
          <dd class="font-mono text-lg tabular-nums">
            {{ timeMs > 0 ? formatTime(timeMs) : 'not recorded' }}
          </dd>
          <dt class="text-sm text-muted-foreground">Points</dt>
          <dd class="text-4xl font-bold tabular-nums">{{ total ?? '–' }}</dd>
        </template>
      </dl>
      <DialogFooter class="gap-2">
        <Button variant="outline" size="touch" @click="open = false">Back to sheet</Button>
        <Button size="touch" :disabled="busy" @click="emit('confirm')">
          <SendIcon /> Submit score
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
