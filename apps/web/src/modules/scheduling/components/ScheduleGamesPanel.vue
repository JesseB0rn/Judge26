<script setup lang="ts">
import { computed, ref } from 'vue'
import { PencilIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/shared/format'
import type { GameRecord, TableRecord } from '@/shared/types/records'
import type { EventJudge } from '../api'
import PlacementDialog from './PlacementDialog.vue'
import { isPlaced, judgeNames, sortForSchedule, tableName } from '../lib'

const props = defineProps<{
  games: GameRecord[]
  tables: TableRecord[]
  judges: EventJudge[]
  editable: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const open = ref(false)
const selected = ref<GameRecord>()
const rows = computed(() => sortForSchedule(props.games))
const unplaced = computed(() => props.games.filter((g) => !isPlaced(g)).length)

function edit(game: GameRecord) {
  selected.value = game
  open.value = true
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Games</CardTitle>
    </CardHeader>
    <CardContent class="flex flex-col gap-3">
      <p class="text-sm text-muted-foreground" data-testid="schedule-summary">
        {{ games.length - unplaced }} placed · {{ unplaced }} unplaced
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="schedule-games">
          <thead>
            <tr class="border-b text-left text-muted-foreground">
              <th class="py-2 pr-3 font-medium">Start</th>
              <th class="py-2 pr-3 font-medium">Table</th>
              <th class="py-2 pr-3 font-medium">Team</th>
              <th class="py-2 pr-3 font-medium">Round</th>
              <th class="py-2 pr-3 font-medium">Judges</th>
              <th class="py-2 pr-3 font-medium">Locked</th>
              <th class="py-2"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in rows" :key="game.id" class="border-b" :data-game="game.id">
              <td class="py-2 pr-3">{{ game.starts_at ? formatDateTime(game.starts_at) : '–' }}</td>
              <td class="py-2 pr-3">{{ game.table ? tableName(tables, game.table) : '–' }}</td>
              <td class="py-2 pr-3">{{ game.expand?.team?.name ?? 'Unknown team' }}</td>
              <td class="py-2 pr-3">{{ game.expand?.round?.name ?? '' }}</td>
              <td class="py-2 pr-3">{{ judgeNames(game.judges, judges) }}</td>
              <td class="py-2 pr-3">{{ game.locked ? 'yes' : '' }}</td>
              <td class="py-2 text-right">
                <Button
                  v-if="editable && game.status === 'scheduled'"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="`Schedule ${game.expand?.team?.name ?? game.id}`"
                  @click="edit(game)"
                >
                  <PencilIcon />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!games.length" class="py-4 text-sm text-muted-foreground">No games yet.</p>
      </div>
      <PlacementDialog
        v-model:open="open"
        :game="selected"
        :tables="tables"
        :judges="judges"
        @saved="emit('changed')"
      />
    </CardContent>
  </Card>
</template>
