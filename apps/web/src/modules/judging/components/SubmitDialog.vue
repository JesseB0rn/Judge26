<script setup lang="ts">
import { t, translatedLabels } from '@/i18n'
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

const OUTCOME_LABELS = translatedLabels<Outcome>(['completed', 'disqualified', 'absent'], (o) =>
  t(`judging.submit.outcome.${o}`),
)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('judging.submit.title', { team }) }}</DialogTitle>
        <DialogDescription>{{ t('judging.submit.description') }}</DialogDescription>
      </DialogHeader>
      <dl
        class="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2"
        data-testid="submit-summary"
      >
        <dt class="text-sm text-muted-foreground">{{ t('judging.submit.game') }}</dt>
        <dd class="text-sm">{{ context }}</dd>
        <dt class="text-sm text-muted-foreground">{{ t('judging.outcome.label') }}</dt>
        <dd class="font-medium">{{ OUTCOME_LABELS[outcome] }}</dd>
        <template v-if="outcome === 'completed'">
          <dt class="text-sm text-muted-foreground">{{ t('judging.time') }}</dt>
          <dd class="font-mono text-lg tabular-nums">
            {{ timeMs > 0 ? formatTime(timeMs) : t('judging.submit.noTime') }}
          </dd>
          <dt class="text-sm text-muted-foreground">{{ t('scheduling.export.points') }}</dt>
          <dd class="text-4xl font-bold tabular-nums">{{ total ?? '–' }}</dd>
        </template>
      </dl>
      <DialogFooter class="gap-2">
        <Button variant="outline" size="touch" @click="open = false">{{
          t('judging.submit.back')
        }}</Button>
        <Button size="touch" :disabled="busy" @click="emit('confirm')">
          <SendIcon /> {{ t('judging.submit.submit') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
