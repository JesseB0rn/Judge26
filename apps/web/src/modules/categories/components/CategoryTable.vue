<script setup lang="ts">
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
import { CalculatorIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { CategoryRecord } from '@/shared/types/records'

defineProps<{ categories: CategoryRecord[] | undefined; loading?: boolean; empty: string }>()

const range = (min: number, max: number) =>
  min && max ? `${min}–${max}` : min ? `≥ ${min}` : max ? `≤ ${max}` : 'any'
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Code</TableHead>
        <TableHead>Name</TableHead>
        <TableHead>Team size</TableHead>
        <TableHead>Age</TableHead>
        <TableHead class="hidden md:table-cell">Max. teams</TableHead>
        <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
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
          <Button as-child variant="ghost" size="icon-sm">
            <RouterLink
              :to="{ name: 'category-scoring', params: { id: c.id } }"
              :aria-label="`Scoring rules for ${c.code}`"
            >
              <CalculatorIcon />
            </RouterLink>
          </Button>
          <slot name="actions" :category="c" />
        </TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !categories?.length" :colspan="6">{{ empty }}</TableEmpty>
    </TableBody>
  </Table>
</template>
