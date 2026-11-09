<script setup lang="ts">
import { computed } from 'vue'
import { Textarea } from '@/components/ui/textarea'
import { parseRuleset } from '../lib'

defineProps<{ readonly?: boolean }>()
const text = defineModel<string>({ required: true })
const parsed = computed(() => parseRuleset(text.value))
</script>

<template>
  <div class="flex flex-col gap-2">
    <Textarea
      v-model="text"
      aria-label="Ruleset definition (JSON)"
      class="min-h-96 font-mono text-xs"
      spellcheck="false"
      :readonly="readonly"
    />
    <p
      v-if="parsed.syntaxError"
      class="text-sm text-destructive"
      role="alert"
      data-testid="ruleset-issues"
    >
      Invalid JSON: {{ parsed.syntaxError }}
    </p>
    <ul
      v-else-if="parsed.issues.length"
      class="text-sm text-destructive"
      role="alert"
      data-testid="ruleset-issues"
    >
      <li v-for="issue in parsed.issues" :key="issue.path + issue.code">
        <code>{{ issue.path }}</code
        >: {{ issue.message }}
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground" data-testid="ruleset-valid">
      The ruleset is valid.
    </p>
  </div>
</template>
