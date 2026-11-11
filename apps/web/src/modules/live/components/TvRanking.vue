<script setup lang="ts">
import { t } from '@/i18n'
import { computed } from 'vue'
import { formatValue } from '@/modules/rankings/lib'
import { pageOf } from '../lib'
import type { PublicTeam, PublishedRanking } from '../types'

/** A page of a ranking in large type for a TV (M6-05). */
const props = defineProps<{
  ranking: PublishedRanking
  teams: Record<string, PublicTeam>
  page: number
  perPage: number
}>()

const rows = computed(() => pageOf(props.ranking.result.entries, props.page, props.perPage))
const keys = computed(() => props.ranking.result.keys)
</script>

<template>
  <table class="w-full border-separate border-spacing-y-1.5 text-[clamp(1rem,2.4vh,2.25rem)]">
    <thead>
      <tr class="text-left text-[0.6em] tracking-wider text-slate-400 uppercase">
        <th class="w-[3.5em] px-4 font-medium">{{ t('live.tv.rank') }}</th>
        <th class="px-4 font-medium">{{ t('teams.team') }}</th>
        <th v-for="key in keys" :key="key.label" class="px-4 text-right font-medium">
          {{ key.label }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="entry in rows"
        :key="entry.team"
        class="bg-slate-800/70"
        :data-team="entry.name"
        data-testid="tv-ranking-row"
      >
        <td class="rounded-l-lg px-4 py-[0.35em] font-bold tabular-nums">
          {{ entry.rank ?? '–' }}<span v-if="entry.shared" class="text-slate-400">=</span>
        </td>
        <td class="px-4 py-[0.35em]">
          <span class="font-semibold">{{ entry.name }}</span>
          <span v-if="entry.provisional" class="ml-2 text-[0.6em] text-amber-300">{{
            t('live.provisional')
          }}</span>
          <span
            v-if="teams[entry.team]?.organization || teams[entry.team]?.country"
            class="ml-3 text-[0.65em] text-slate-400"
          >
            {{
              [teams[entry.team]?.organization, teams[entry.team]?.country]
                .filter(Boolean)
                .join(' · ')
            }}
          </span>
        </td>
        <td
          v-for="(value, i) in entry.values"
          :key="i"
          class="px-4 py-[0.35em] text-right tabular-nums last:rounded-r-lg"
        >
          {{ formatValue(value, keys[i]!.field) }}
        </td>
      </tr>
    </tbody>
  </table>
  <p v-if="!ranking.result.entries.length" class="text-2xl text-slate-400">
    {{ t('live.tv.noTeams') }}
  </p>
</template>
