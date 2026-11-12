<script setup lang="ts">
import { t, type MessageKey } from '@/i18n'
import { computed, onMounted } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { ArrowRightIcon, CalendarRangeIcon, CircleCheckIcon, CircleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import { getSetupStatus, type SetupStep, type SetupStepKey } from '../api'

/**
 * Setup checklist of an event (M8-20): each step shows whether it is done, what is missing and
 * links to where it is done. Steps only wait for the data they build on (`needs`).
 */
const props = defineProps<{ event: EventRecord }>()
const { data: status, loading, error, load } = useLoader(() => getSetupStatus(props.event.id))

/** Event tab where each step is done. */
const TAB: Record<SetupStepKey, string> = {
  days: 'overview',
  categories: 'categories',
  rounds: 'categories',
  tables: 'schedule',
  teams: 'teams',
  judges: 'staff',
  schedule: 'schedule',
  publish: 'overview',
}

const doneCount = computed(() => status.value?.steps.filter((s) => s.done).length ?? 0)
const doneKeys = computed(
  () => new Set(status.value?.steps.filter((s) => s.done).map((s) => s.key)),
)

function title(key: SetupStepKey) {
  return t(`templates.setup.steps.${key}.title` as MessageKey)
}

/** Steps this one builds on that are not done yet. */
function waitingFor(step: SetupStep) {
  return step.needs.filter((key) => !doneKeys.value.has(key))
}

function summary(step: SetupStep): string {
  const key = `templates.setup.steps.${step.key}`
  const codes = step.missing?.join(', ') ?? ''
  if (step.key === 'schedule') {
    return step.expected || step.rounds
      ? t('templates.setup.steps.schedule.progress', {
          placed: step.placed ?? 0,
          expected: step.expected ?? 0,
          timed: step.timed ?? 0,
          rounds: step.rounds ?? 0,
        })
      : t('templates.setup.steps.schedule.todo')
  }
  if (step.key === 'publish') {
    return step.done
      ? t('templates.setup.steps.publish.done')
      : t('templates.setup.steps.publish.todo')
  }
  if (codes) return t(`${key}.missing` as MessageKey, { codes })
  if (step.key === 'judges' && step.count && step.tables_without_judges) {
    return t('templates.setup.steps.judges.withoutJudges', step.tables_without_judges)
  }
  if (!step.count) return t(`${key}.todo` as MessageKey)
  return t(`${key}.done` as MessageKey, step.count)
}

function link(step: SetupStep): RouteLocationRaw {
  return { name: 'event', params: { id: props.event.id }, query: { tab: TAB[step.key] } }
}

onMounted(load)
defineExpose({ reload: load })
</script>

<template>
  <Card data-testid="setup-checklist">
    <CardHeader>
      <CardTitle>{{ t('templates.setup.title') }}</CardTitle>
      <CardDescription>{{ t('templates.setup.description') }}</CardDescription>
      <p v-if="status" class="text-sm font-medium" data-testid="setup-progress">
        {{
          status.complete
            ? t('templates.setup.complete')
            : t('templates.setup.progress', { done: doneCount, total: status.steps.length })
        }}
      </p>
    </CardHeader>
    <CardContent>
      <ErrorAlert :error="error" />
      <Skeleton v-if="loading && !status" class="h-40 w-full" />
      <ol v-if="status" class="divide-y">
        <li
          v-for="step in status.steps"
          :key="step.key"
          class="flex flex-wrap items-center gap-3 py-3"
          :data-step="step.key"
          :data-done="step.done"
        >
          <CircleCheckIcon
            v-if="step.done"
            class="size-5 shrink-0 text-green-600"
            aria-hidden="true"
          />
          <CircleIcon v-else class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ title(step.key) }}
              <span class="sr-only">
                ({{
                  step.done ? t('templates.setup.doneLabel') : t('templates.setup.todoLabel')
                }})</span
              >
            </p>
            <p class="text-sm text-muted-foreground">{{ summary(step) }}</p>
            <p
              v-if="!step.done && waitingFor(step).length"
              class="text-sm text-amber-700 dark:text-amber-400"
              data-testid="setup-needs"
            >
              {{ t('templates.setup.needs', { steps: waitingFor(step).map(title).join(', ') }) }}
            </p>
          </div>
          <div class="flex gap-2">
            <Button v-if="step.key === 'schedule'" as-child size="sm" variant="outline">
              <RouterLink :to="{ name: 'event-planner', params: { id: event.id } }">
                <CalendarRangeIcon /> {{ t('templates.setup.openPlanner') }}
              </RouterLink>
            </Button>
            <Button
              v-if="step.key !== 'publish'"
              as-child
              size="sm"
              :variant="step.done ? 'ghost' : 'outline'"
            >
              <RouterLink
                :to="link(step)"
                :aria-label="`${t('templates.setup.open')}: ${title(step.key)}`"
              >
                {{ t('templates.setup.open') }} <ArrowRightIcon />
              </RouterLink>
            </Button>
          </div>
        </li>
      </ol>
    </CardContent>
  </Card>
</template>
