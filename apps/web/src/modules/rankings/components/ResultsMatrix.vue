<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
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
import type { GameRecord, RoundRecord, TeamRecord } from '@/shared/types/records'
import { formatTime } from '../lib'

/** Teams × rounds overview of recorded results. */
const props = defineProps<{
  teams: TeamRecord[]
  rounds: RoundRecord[]
  games: GameRecord[]
  editable: boolean
}>()
const emit = defineEmits<{ open: [team: TeamRecord, round: RoundRecord] }>()

const cell = computed(() => {
  const map = new Map<string, GameRecord[]>()
  for (const g of props.games) {
    const key = `${g.team}:${g.round}`
    map.set(key, [...(map.get(key) ?? []), g])
  }
  return (team: string, round: string) => map.get(`${team}:${round}`) ?? []
})

const label = (g: GameRecord) => {
  if (g.status === 'completed')
    return `${g.points}${g.time_ms > 0 ? ' / ' + formatTime(g.time_ms) : ''}`
  return g.status === 'disqualified' ? 'DQ' : g.status === 'absent' ? 'absent' : 'scheduled'
}
</script>

<template>
  <Table data-testid="results-matrix">
    <TableHeader>
      <TableRow>
        <TableHead>Team</TableHead>
        <TableHead v-for="round in rounds" :key="round.id">{{ round.name }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="team in teams" :key="team.id" :data-team="team.name">
        <TableCell class="font-medium">{{ team.name }}</TableCell>
        <TableCell v-for="round in rounds" :key="round.id" :data-round="round.key">
          <div class="flex flex-wrap items-center gap-1">
            <Badge
              v-for="g in cell(team.id, round.id)"
              :key="g.id"
              :variant="g.status === 'completed' ? 'secondary' : 'outline'"
              class="tabular-nums"
            >
              <span v-if="cell(team.id, round.id).length > 1">#{{ g.attempt }}&nbsp;</span
              >{{ label(g) }}
            </Badge>
            <Button
              v-if="editable"
              size="xs"
              variant="ghost"
              :aria-label="`Results of ${team.name} in ${round.name}`"
              @click="emit('open', team, round)"
            >
              {{ cell(team.id, round.id).length ? 'Edit' : 'Enter' }}
            </Button>
            <span v-else-if="!cell(team.id, round.id).length" class="text-muted-foreground">–</span>
          </div>
        </TableCell>
      </TableRow>
      <TableEmpty v-if="!teams.length" :colspan="rounds.length + 1">No approved teams.</TableEmpty>
    </TableBody>
  </Table>
</template>
