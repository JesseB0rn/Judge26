<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import { ChevronDownIcon, ChevronRightIcon } from '@lucide/vue'
import type { Ranking, RankingConfig } from '@judge26/ranking-engine'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatValue } from '../lib'
import ResultTree from './ResultTree.vue'

/** Ranking with key values, tie-break information and per-team explanations. */
const props = defineProps<{ ranking: Ranking; config: RankingConfig }>()
const expanded = ref(new Set<string>())

function toggle(team: string) {
  const next = new Set(expanded.value)
  if (next.has(team)) next.delete(team)
  else next.add(team)
  expanded.value = next
}

const sources = () => [
  ...new Set(
    props.config.ranking.keys.map((k) => ('calc' in k.source ? k.source.calc : k.source.round)),
  ),
]
const decided = (d: number | 'name' | null) =>
  d === null
    ? ''
    : d === 'name'
      ? t('rankings.table.byName')
      : t('rankings.table.by', { key: props.ranking.keys[d]?.label ?? '' })
</script>

<template>
  <Table data-testid="ranking">
    <TableHeader>
      <TableRow>
        <TableHead class="w-16">{{ t('live.tv.rank') }}</TableHead>
        <TableHead>{{ t('teams.team') }}</TableHead>
        <TableHead v-for="key in ranking.keys" :key="key.label" class="text-right">{{
          key.label
        }}</TableHead>
        <TableHead class="hidden md:table-cell">{{ t('rankings.table.decided') }}</TableHead>
        <TableHead class="w-0"
          ><span class="sr-only">{{ t('events.detail.details') }}</span></TableHead
        >
      </TableRow>
    </TableHeader>
    <TableBody>
      <template v-for="entry in ranking.entries" :key="entry.team">
        <TableRow :data-team="entry.name">
          <TableCell class="font-semibold tabular-nums" data-testid="rank">
            {{ entry.rank ?? '–'
            }}<span v-if="entry.shared" :title="t('rankings.table.shared')">=</span>
          </TableCell>
          <TableCell>
            {{ entry.name }}
            <span
              v-if="entry.provisional"
              class="text-xs text-muted-foreground"
              :title="t('rankings.table.missingResults')"
            >
              ({{ t('live.provisional') }})</span
            >
          </TableCell>
          <TableCell v-for="(value, i) in entry.values" :key="i" class="text-right tabular-nums">
            {{ formatValue(value, ranking.keys[i]!.field) }}
          </TableCell>
          <TableCell class="hidden text-muted-foreground md:table-cell">{{
            decided(entry.decidedBy)
          }}</TableCell>
          <TableCell>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="t('rankings.table.explain', { team: entry.name })"
              :aria-expanded="expanded.has(entry.team)"
              @click="toggle(entry.team)"
            >
              <ChevronDownIcon v-if="expanded.has(entry.team)" />
              <ChevronRightIcon v-else />
            </Button>
          </TableCell>
        </TableRow>
        <TableRow v-if="expanded.has(entry.team)">
          <TableCell :colspan="ranking.keys.length + 4" class="bg-muted/30 whitespace-normal">
            <ul class="flex flex-col gap-2 text-sm" :data-testid="`explain-${entry.name}`">
              <ResultTree v-for="id in sources()" :key="id" :result="entry.results[id]!" />
            </ul>
          </TableCell>
        </TableRow>
      </template>
      <TableEmpty v-if="!ranking.entries.length" :colspan="ranking.keys.length + 4">{{
        t('live.tv.noTeams')
      }}</TableEmpty>
    </TableBody>
  </Table>
</template>
