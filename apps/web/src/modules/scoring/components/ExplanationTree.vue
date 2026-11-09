<script setup lang="ts">
import type { Explanation } from '@judge26/scoring-engine'

/** Shows how a score was calculated, node by node (M2-13). */
defineProps<{ explanation: Explanation; selected?: boolean }>()
</script>

<template>
  <li :class="{ 'text-muted-foreground': !explanation.active }" :data-explain="explanation.id">
    <div class="flex items-baseline gap-2">
      <span :class="{ 'font-medium': explanation.type === 'group', underline: selected }">{{
        explanation.label
      }}</span>
      <span class="text-xs text-muted-foreground">{{ explanation.formula }}</span>
      <span class="ml-auto tabular-nums">{{ explanation.points }}</span>
    </div>
    <ul v-if="explanation.children?.length" class="ml-4 border-l pl-3">
      <ExplanationTree
        v-for="child in explanation.children"
        :key="child.id"
        :explanation="child"
        :selected="child.id === explanation.selectedChild"
      />
    </ul>
  </li>
</template>
