<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref } from 'vue'
import { WandSparklesIcon } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { generateSchedule, type GenerationOutcome, type ScheduleIssue } from '../api'
import { issueMessage, reasonLabel } from '../lib'

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
  `${props.labels[issue.gameId] ?? issue.gameId}: ${issueMessage(issue)}`

const run = useSubmit(async (dryRun: boolean) => {
  outcome.value = await generateSchedule(props.eventId, dryRun)
  if (outcome.value.status === 'complete' && !dryRun) emit('changed')
  return outcome.value
})

const summary = computed(() => {
  const o = outcome.value
  if (!o) return null
  if (o.status === 'complete') {
    const created = o.created_games ?? 0
    const count = o.placements.length
    const createdSummary = created
      ? ' ' +
        (o.dry_run
          ? t('scheduling.generate.wouldCreate', created)
          : t('scheduling.generate.created', created))
      : ''
    return o.dry_run
      ? t('scheduling.generate.preview', { count }) +
          createdSummary +
          ' ' +
          t('scheduling.generate.nothingSaved')
      : t('scheduling.generate.saved', { count }) + createdSummary
  }
  return o.status === 'infeasible' ? t('scheduling.generate.infeasible') : o.message
})
</script>

<template>
  <Card>
    <CardHeader
      ><CardTitle>{{ t('scheduling.generate.title') }}</CardTitle></CardHeader
    >
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="run.error.value" />

      <section class="flex flex-col gap-2" data-testid="schedule-issues">
        <p v-if="!issues.length" class="text-sm text-muted-foreground">
          {{ t('scheduling.generate.noConflicts') }}
        </p>
        <Alert v-else variant="destructive">
          <AlertTitle>{{ t('scheduling.generate.conflicts', issues.length) }}</AlertTitle>
          <AlertDescription>
            <ul class="list-disc pl-5">
              <li v-for="(issue, i) in issues" :key="i">{{ issueLabel(issue) }}</li>
            </ul>
          </AlertDescription>
        </Alert>
      </section>

      <section v-if="editable" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">
          {{ t('scheduling.generate.explanation') }}
        </p>
        <div class="flex gap-2">
          <Button variant="outline" :disabled="run.pending.value" @click="run.run(true)">
            {{ t('scheduling.generate.previewButton') }}
          </Button>
          <Button :disabled="run.pending.value" @click="run.run(false)">
            <WandSparklesIcon /> {{ t('scheduling.generate.generate') }}
          </Button>
        </div>

        <Alert v-if="summary" :variant="outcome?.status === 'complete' ? 'default' : 'destructive'">
          <AlertDescription data-testid="generation-summary">{{ summary }}</AlertDescription>
        </Alert>
      </section>

      <p v-else class="text-sm text-muted-foreground" data-testid="schedule-permission">
        {{ t('scheduling.generate.permission') }}
      </p>

      <section v-if="editable">
        <ul
          v-if="outcome && outcome.status === 'infeasible'"
          class="list-disc pl-5 text-sm"
          data-testid="unplaced"
        >
          <li v-for="item in outcome.unplaced" :key="item.gameId">
            {{ item.label ?? labels[item.gameId] ?? item.gameId }}:
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
