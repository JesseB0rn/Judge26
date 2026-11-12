<script setup lang="ts">
import { t } from '@/i18n'
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
      <CardTitle>{{ t('scheduling.games.title') }}</CardTitle>
    </CardHeader>
    <CardContent class="flex flex-col gap-3">
      <p class="text-sm text-muted-foreground" data-testid="schedule-summary">
        {{
          t('scheduling.games.summary', { assigned: games.length - unplaced, unassigned: unplaced })
        }}
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="schedule-games">
          <thead>
            <tr class="border-b text-left text-muted-foreground">
              <th class="py-2 pr-3 font-medium">{{ t('teams.mine.round') }}</th>
              <th class="py-2 pr-3 font-medium">{{ t('teams.mine.table') }}</th>
              <th class="py-2 pr-3 font-medium">{{ t('teams.mine.sequence') }}</th>
              <th class="py-2 pr-3 font-medium">{{ t('teams.team') }}</th>
              <th class="py-2 pr-3 font-medium">{{ t('common.roles.judge') }}</th>
              <th class="py-2">
                <span class="sr-only">{{ t('common.actions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="game in rows" :key="game.id" class="border-b" :data-game="game.id">
              <td class="py-2 pr-3">{{ game.expand?.round?.name ?? '' }}</td>
              <td class="py-2 pr-3">
                {{ tables.find((table) => table.id === game.table)?.name ?? '–' }}
              </td>
              <td class="py-2 pr-3">{{ game.sequence || '–' }}</td>
              <td class="py-2 pr-3">
                {{ game.expand?.team?.name ?? t('scheduling.unknownTeam') }}
              </td>
              <td class="py-2 pr-3">
                {{
                  tables
                    .find((table) => table.id === game.table)
                    ?.expand?.judges?.map((judge) => judge.name)
                    .join(', ') || '–'
                }}
              </td>
              <td class="py-2 text-right">
                <Button
                  v-if="editable"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="
                    t('scheduling.games.setSequence', { team: game.expand?.team?.name ?? game.id })
                  "
                  @click="edit(game)"
                >
                  <PencilIcon />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!games.length" class="py-4 text-sm text-muted-foreground">
          {{ t('scheduling.games.empty') }}
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
