<script setup lang="ts">
import { computed } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import RankingTable from '@/modules/rankings/components/RankingTable.vue'
import FilterChips from '@/shared/components/FilterChips.vue'
import { formatDateTime } from '@/shared/format'
import { isProvisional, pickRanking, progressFromCounts } from '../lib'
import type { PublicRanking, RankingSource } from '../types'
import ProgressBar from './ProgressBar.vue'

/** Official and/or live ranking of one category, as published (M6-02, M6-03). */
const props = defineProps<{ ranking: PublicRanking }>()
const source = defineModel<RankingSource | ''>('source', { default: '' })

const shown = computed(() => pickRanking(props.ranking, source.value || undefined))
const both = computed(() => !!props.ranking.official && !!props.ranking.live)
const provisional = computed(
  () => !!shown.value && isProvisional(props.ranking, shown.value.source),
)
const progress = computed(() => progressFromCounts(props.ranking.progress))
const sourceModel = computed({
  get: () => shown.value?.source ?? '',
  set: (value: string) => (source.value = value as RankingSource),
})
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="public-ranking">
    <Alert v-if="!shown" data-testid="not-published">
      <AlertDescription>Results for this category have not been published yet.</AlertDescription>
    </Alert>
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          v-if="both"
          v-model="sourceModel"
          label="Ranking"
          required
          :options="[
            { value: 'official', label: 'Official' },
            { value: 'live', label: 'Live' },
          ]"
        />
        <p
          v-if="shown.source === 'official' && ranking.official"
          class="text-sm text-muted-foreground"
          data-testid="official-title"
        >
          <span class="font-medium text-foreground">{{ ranking.official.title }}</span>
          · official, published {{ formatDateTime(ranking.official.published_at) }}
        </p>
        <p v-else class="text-sm text-muted-foreground" data-testid="live-title">
          <span class="font-medium text-foreground">Live ranking</span> · from final scores, not
          official
        </p>
      </div>
      <Alert v-if="provisional" data-testid="provisional">
        <AlertDescription>
          Provisional: {{ progress.total - progress.done }} of {{ progress.total }} games are not
          final yet. Teams marked “provisional” are missing round results.
        </AlertDescription>
      </Alert>
      <ProgressBar v-if="shown.source === 'live'" :progress="progress" />
      <RankingTable :ranking="shown.ranking.result" :config="shown.ranking.config" />
    </template>
  </div>
</template>
