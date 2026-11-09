<script setup lang="ts">
import { computed } from 'vue'
import { Textarea } from '@/components/ui/textarea'
import { parseRankingConfig } from '../lib'

defineProps<{ readonly?: boolean }>()
const text = defineModel<string>({ required: true })
const parsed = computed(() => parseRankingConfig(text.value))
</script>

<template>
  <div class="flex flex-col gap-2">
    <Textarea
      v-model="text"
      aria-label="Ranking configuration (JSON)"
      class="min-h-96 font-mono text-xs"
      spellcheck="false"
      :readonly="readonly"
    />
    <p v-if="!text.trim()" class="text-sm text-muted-foreground">No ranking configuration yet.</p>
    <p
      v-else-if="parsed.syntaxError"
      class="text-sm text-destructive"
      role="alert"
      data-testid="config-issues"
    >
      Invalid JSON: {{ parsed.syntaxError }}
    </p>
    <ul
      v-else-if="parsed.issues.length"
      class="text-sm text-destructive"
      role="alert"
      data-testid="config-issues"
    >
      <li v-for="issue in parsed.issues" :key="issue.path + issue.code">
        <code>{{ issue.path }}</code
        >: {{ issue.message }}
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground" data-testid="config-valid">
      The configuration is valid.
    </p>
  </div>
</template>
