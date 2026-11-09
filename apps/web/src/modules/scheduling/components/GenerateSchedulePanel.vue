<script setup lang="ts">
import { computed, ref } from 'vue'
import { WandSparklesIcon } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { generateSchedule, type GenerationOutcome, type ScheduleIssue } from '../api'
import { reasonLabel } from '../lib'

const props = defineProps<{
  eventId: string
  issues: ScheduleIssue[]
  /** Game id → readable label, for messages. */
  labels: Record<string, string>
  editable: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const outcome = ref<GenerationOutcome>()
const issueLabel = (issue: ScheduleIssue) =>
  `${props.labels[issue.gameId] ?? issue.gameId}: ${issue.message}`

const run = useSubmit(async (dryRun: boolean) => {
  outcome.value = await generateSchedule(props.eventId, dryRun)
  if (outcome.value.status === 'complete' && !dryRun) emit('changed')
  return outcome.value
})

const summary = computed(() => {
  const o = outcome.value
  if (!o) return null
  if (o.status === 'complete') {
    return o.dry_run
      ? `Preview: all ${o.placements.length} games fit. Nothing was saved.`
      : `Schedule saved: ${o.placements.length} games placed.`
  }
  return o.message
})
</script>

<template>
  <Card>
    <CardHeader><CardTitle>Schedule check and generation</CardTitle></CardHeader>
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="run.error.value" />

      <section class="flex flex-col gap-2" data-testid="schedule-issues">
        <p v-if="!issues.length" class="text-sm text-muted-foreground">
          No conflicts in the current schedule.
        </p>
        <Alert v-else variant="destructive">
          <AlertTitle>{{ issues.length }} conflict(s) in the current schedule</AlertTitle>
          <AlertDescription>
            <ul class="list-disc pl-5">
              <li v-for="(issue, i) in issues" :key="i">{{ issueLabel(issue) }}</li>
            </ul>
          </AlertDescription>
        </Alert>
      </section>

      <section v-if="editable" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">
          Generation places every scheduled game that is not locked. Nothing changes unless the
          complete schedule fits.
        </p>
        <div class="flex gap-2">
          <Button variant="outline" :disabled="run.pending.value" @click="run.run(true)">
            Preview
          </Button>
          <Button :disabled="run.pending.value" @click="run.run(false)">
            <WandSparklesIcon /> Generate schedule
          </Button>
        </div>

        <Alert v-if="summary" :variant="outcome?.status === 'complete' ? 'default' : 'destructive'">
          <AlertDescription data-testid="generation-summary">{{ summary }}</AlertDescription>
        </Alert>

        <ul
          v-if="outcome && outcome.status === 'infeasible'"
          class="list-disc pl-5 text-sm"
          data-testid="unplaced"
        >
          <li v-for="item in outcome.unplaced" :key="item.gameId">
            {{ labels[item.gameId] ?? item.gameId }}:
            {{ item.reasons.map(reasonLabel).join(' ') }}
          </li>
        </ul>
        <ul
          v-if="outcome && outcome.status === 'invalid'"
          class="list-disc pl-5 text-sm"
          data-testid="locked-issues"
        >
          <li v-for="(issue, i) in outcome.issues" :key="i">{{ issueLabel(issue) }}</li>
        </ul>
      </section>
    </CardContent>
  </Card>
</template>
