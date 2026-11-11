<script setup lang="ts">
import { t } from '@/i18n'
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
      :aria-label="t('rankings.config.json')"
      class="min-h-96 font-mono text-xs"
      spellcheck="false"
      :readonly="readonly"
    />
    <p v-if="!text.trim()" class="text-sm text-muted-foreground">
      {{ t('rankings.config.empty') }}
    </p>
    <p
      v-else-if="parsed.syntaxError"
      class="text-sm text-destructive"
      role="alert"
      data-testid="config-issues"
    >
      {{ t('rankings.config.invalidJson', { error: parsed.syntaxError }) }}
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
      {{ t('rankings.config.valid') }}
    </p>
  </div>
</template>
