<script setup lang="ts">
import { t } from '@/i18n'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RouterLink } from 'vue-router'
import { CalculatorIcon, TrophyIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { CategoryRecord } from '@/shared/types/records'

defineProps<{
  categories: CategoryRecord[] | undefined
  loading?: boolean
  empty: string
  /** Show the rounds & ranking link (event staff and admins). */
  showRanking?: boolean
}>()

const range = (min: number, max: number) =>
  min && max ? `${min}–${max}` : min ? `≥ ${min}` : max ? `≤ ${max}` : t('categories.any')
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ t('categories.code') }}</TableHead>
        <TableHead>{{ t('common.name') }}</TableHead>
        <TableHead>{{ t('categories.teamSize') }}</TableHead>
        <TableHead>{{ t('categories.age') }}</TableHead>
        <TableHead class="hidden md:table-cell">{{ t('categories.maxTeams') }}</TableHead>
        <TableHead class="w-0"
          ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
        >
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="c in categories" :key="c.id">
        <TableCell class="font-mono">{{ c.code }}</TableCell>
        <TableCell>{{ c.name }}</TableCell>
        <TableCell>{{ range(c.min_team_size, c.max_team_size) }}</TableCell>
        <TableCell>{{ range(c.min_age, c.max_age) }}</TableCell>
        <TableCell class="hidden md:table-cell">{{ c.max_teams || '∞' }}</TableCell>
        <TableCell class="text-right whitespace-nowrap">
          <!-- Labelled, not icon-only: under time pressure nobody should guess what a glyph means. -->
          <Button v-if="showRanking" as-child variant="outline" size="sm">
            <RouterLink
              :to="{ name: 'category-ranking', params: { id: c.id } }"
              :aria-label="t('categories.rankingFor', { code: c.code })"
            >
              <TrophyIcon /> {{ t('categories.ranking') }}
            </RouterLink>
          </Button>
          <Button as-child variant="ghost" size="sm">
            <RouterLink
              :to="{ name: 'category-scoring', params: { id: c.id } }"
              :aria-label="t('categories.rulesFor', { code: c.code })"
            >
              <CalculatorIcon /> {{ t('categories.rules') }}
            </RouterLink>
          </Button>
          <slot name="actions" :category="c" />
        </TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !categories?.length" :colspan="6">{{ empty }}</TableEmpty>
    </TableBody>
  </Table>
</template>
