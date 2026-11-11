<script setup lang="ts">
import { t } from '@/i18n'
import type { Progress } from '../lib'

/** Done / in review / remaining games as a stacked bar with numbers (M6-08). */
defineProps<{ progress: Progress; label?: string }>()
</script>

<template>
  <div class="flex flex-col gap-1.5" data-testid="progress">
    <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span v-if="label" class="font-medium">{{ label }}</span>
      <span class="text-muted-foreground tabular-nums" data-testid="progress-text">
        {{ t('live.progress.done', { done: progress.done, total: progress.total })
        }}<template v-if="progress.inReview">
          · {{ t('live.progress.inReview', { count: progress.inReview }) }}</template
        >
        · {{ t('live.progress.remaining', { count: progress.remaining }) }}
      </span>
    </div>
    <div
      class="flex h-2.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      :aria-valuenow="progress.done"
      :aria-valuemax="progress.total"
      :aria-label="label ? t('live.progress.labelOf', { label }) : t('live.progress.title')"
    >
      <div
        class="bg-emerald-500"
        :style="{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0' }"
      />
      <div
        class="bg-sky-400"
        :style="{ width: progress.total ? `${(progress.inReview / progress.total) * 100}%` : '0' }"
      />
    </div>
  </div>
</template>
