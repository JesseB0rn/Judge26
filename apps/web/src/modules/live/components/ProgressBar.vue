<script setup lang="ts">
import { t } from '@/i18n'
import type { Progress, RoundSegment } from '../lib'

/**
 * Done / in review / remaining games as a stacked bar with numbers (M6-08). With `segments` the
 * bar is divided into one part per round, as wide as its share of the games and filled by its own
 * finished games (M10-36); each part is named with its counts, also for screen readers.
 */
defineProps<{ progress: Progress; label?: string; segments?: RoundSegment[] }>()

const percent = (part: number, total: number) => (total ? `${(part / total) * 100}%` : '0')
const segmentLabel = (s: RoundSegment) =>
  t('live.progress.segment', {
    round: s.category ? `${s.round.name} · ${s.category.code}` : s.round.name,
    done: s.progress.done,
    total: s.progress.total,
  })
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
      class="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      :class="segments?.length ? '' : 'bg-muted'"
      role="progressbar"
      :aria-valuenow="progress.done"
      :aria-valuemax="progress.total"
      :aria-label="label ? t('live.progress.labelOf', { label }) : t('live.progress.title')"
    >
      <template v-if="segments?.length">
        <div
          v-for="s in segments"
          :key="s.round.id"
          class="flex h-full overflow-hidden bg-muted"
          :style="{ width: `${s.share * 100}%` }"
          :title="segmentLabel(s)"
          data-testid="progress-segment"
          :data-round="s.round.id"
        >
          <div
            class="bg-emerald-500"
            data-fill="done"
            :style="{ width: percent(s.progress.done, s.progress.total) }"
          />
          <div
            class="bg-sky-400"
            :style="{ width: percent(s.progress.inReview, s.progress.total) }"
          />
        </div>
      </template>
      <template v-else>
        <div class="bg-emerald-500" :style="{ width: percent(progress.done, progress.total) }" />
        <div class="bg-sky-400" :style="{ width: percent(progress.inReview, progress.total) }" />
      </template>
    </div>
    <!-- The rounds with their counts, readable without hovering and by screen readers. -->
    <ul
      v-if="segments && segments.length > 1"
      class="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums"
      data-testid="progress-segments"
    >
      <li v-for="s in segments" :key="s.round.id">{{ segmentLabel(s) }}</li>
    </ul>
  </div>
</template>
