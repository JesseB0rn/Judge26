<script setup lang="ts">
import type { ResultExplanation } from '@judge26/ranking-engine'
import { formatTime } from '../lib'

/** How a round or calculation result was derived (M3-16). */
defineProps<{ result: ResultExplanation; selected?: boolean }>()
</script>

<template>
  <li :data-result="result.id" :class="{ 'text-muted-foreground': result.excluded }">
    <div class="flex flex-wrap items-baseline gap-2">
      <span :class="{ 'font-medium': result.kind === 'calculation', underline: selected }">{{
        result.label
      }}</span>
      <span v-if="result.status !== 'ok'" class="rounded bg-muted px-1 text-xs">{{
        result.status
      }}</span>
      <span class="text-xs text-muted-foreground">{{ result.formula }}</span>
      <span class="ml-auto tabular-nums">
        {{ result.points ?? '–'
        }}<template v-if="result.timeMs !== null"> / {{ formatTime(result.timeMs) }}</template>
      </span>
    </div>
    <ul v-if="result.operands?.length" class="ml-4 border-l pl-3">
      <ResultTree
        v-for="operand in result.operands"
        :key="operand.id"
        :result="operand"
        :selected="operand.id === result.selected"
      />
    </ul>
  </li>
</template>
