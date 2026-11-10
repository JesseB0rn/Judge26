<script setup lang="ts">
import { computed, ref } from 'vue'
import { PencilIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GameRecord, TableRecord } from '@/shared/types/records'
import GameSequenceDialog from './GameSequenceDialog.vue'
import { isPlaced, sortForSchedule } from '../lib'

const props = defineProps<{
  games: GameRecord[]
  tables: TableRecord[]
  editable: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const open = ref(false)
const selected = ref<GameRecord>()
const rows = computed(() => sortForSchedule(props.games))
const unplaced = computed(() => props.games.filter((game) => !isPlaced(game)).length)

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
        {{ games.length - unplaced }} assigned · {{ unplaced }} unassigned
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="schedule-games">
          <thead>
            <tr class="border-b text-left text-muted-foreground">
              <th class="py-2 pr-3 font-medium">Round</th>
              <th class="py-2 pr-3 font-medium">Table</th>
              <th class="py-2 pr-3 font-medium">Sequence</th>
              <th class="py-2 pr-3 font-medium">Team</th>
              <th class="py-2 pr-3 font-medium">Judge</th>
              <th class="py-2"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in rows" :key="game.id" class="border-b" :data-game="game.id">
              <td class="py-2 pr-3">{{ game.expand?.round?.name ?? '' }}</td>
              <td class="py-2 pr-3">
                {{ tables.find((table) => table.id === game.table)?.name ?? '–' }}
              </td>
              <td class="py-2 pr-3">{{ game.sequence || '–' }}</td>
              <td class="py-2 pr-3">{{ game.expand?.team?.name ?? 'Unknown team' }}</td>
              <td class="py-2 pr-3">
                {{ tables.find((table) => table.id === game.table)?.expand?.judge?.name ?? '–' }}
              </td>
              <td class="py-2 text-right">
                <Button
                  v-if="editable"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="`Set sequence for ${game.expand?.team?.name ?? game.id}`"
                  @click="edit(game)"
                >
                  <PencilIcon />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!games.length" class="py-4 text-sm text-muted-foreground">
          No games yet. Generate the schedule after creating rounds, approved teams, and tables.
        </p>
      </div>
      <GameSequenceDialog
        v-model:open="open"
        :game="selected"
        :tables="tables"
        @saved="emit('changed')"
      />
    </CardContent>
  </Card>
</template>
