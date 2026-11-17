<script setup lang="ts">
import { t, te, type MessageKey } from '@/i18n'
import type { ResultExplanation } from '@judge26/ranking-engine'
import { formatRunTime } from '@judge26/ranking-engine'

/** How a round or calculation result was derived (M3-16). */
withDefaults(
  defineProps<{
    result: ResultExplanation
    selected?: boolean
    /** Decimals of run times (M10-19). */
    decimals?: number
    /** Run times as seconds only instead of minutes:seconds. */
    secondsOnly?: boolean
  }>(),
  { selected: false, decimals: 3, secondsOnly: false },
)
</script>

<template>
  <li :data-result="result.id" :class="{ 'text-muted-foreground': result.excluded }">
    <div class="flex flex-wrap items-baseline gap-2">
      <span :class="{ 'font-medium': result.kind === 'calculation', underline: selected }">{{
        result.label
      }}</span>
      <span v-if="result.status !== 'ok'" class="rounded bg-muted px-1 text-xs">{{
        te(`rankings.resultStatus.${result.status}`)
          ? t(`rankings.resultStatus.${result.status}` as MessageKey)
          : result.status
      }}</span>
      <span class="text-xs text-muted-foreground">{{ result.formula }}</span>
      <span class="ml-auto tabular-nums">
        {{ result.points ?? '–'
        }}<template v-if="result.timeMs !== null">
          / {{ formatRunTime(result.timeMs, decimals, secondsOnly) }}</template
        >
      </span>
    </div>
    <ul v-if="result.operands?.length" class="ml-4 border-l pl-3">
      <ResultTree
        v-for="operand in result.operands"
        :key="operand.id"
        :result="operand"
        :selected="operand.id === result.selected"
        :decimals="decimals"
        :seconds-only="secondsOnly"
      />
    </ul>
  </li>
</template>
