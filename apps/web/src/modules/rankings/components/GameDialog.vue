<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { GameRecord, RoundRecord, RulesetRecord, TeamRecord } from '@/shared/types/records'
import GameForm from './GameForm.vue'

/** Records the result of a team in a round (several attempts per round are possible). */
defineProps<{
  team?: TeamRecord
  round?: RoundRecord
  games: GameRecord[]
  ruleset?: RulesetRecord
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ team?.name }} – {{ round?.name }}</DialogTitle>
        <DialogDescription
          >Record the result. Several attempts per round are possible.</DialogDescription
        >
      </DialogHeader>
      <GameForm
        v-if="open && team && round"
        :key="`${team.id}:${round.id}`"
        :team="team"
        :round="round"
        :games="games"
        :ruleset="ruleset"
        @saved="emit('saved')"
        @close="open = false"
      />
    </DialogContent>
  </Dialog>
</template>
