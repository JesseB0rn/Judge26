<script setup lang="ts">
import { t } from '@/i18n'
import { RouterLink } from 'vue-router'
import { CheckIcon, ChevronRightIcon, ScanSearchIcon } from '@lucide/vue'
import { checkRoute, checkWhen, type RobotCheckBlock } from '../lib'

/** A robot check in the judge's timeline (M5-15); opens the guided check. */
defineProps<{
  block: RobotCheckBlock
  done: boolean
  showTable?: boolean
  highlight?: boolean
  from?: string
}>()
</script>

<template>
  <RouterLink
    :to="checkRoute(block, from)"
    class="flex min-h-16 items-center gap-3 rounded-xl border px-3 py-2 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
    :class="{ 'bg-sky-50/70': highlight }"
    :data-check="block.key"
    :data-done="done"
    :aria-label="`${t('judging.check.title')} ${block.round.name} ${block.category.code}`"
  >
    <span
      class="flex size-11 shrink-0 items-center justify-center rounded-lg"
      :class="done ? 'bg-emerald-100 text-emerald-900' : 'bg-violet-100 text-violet-900'"
    >
      <CheckIcon v-if="done" class="size-5" aria-hidden="true" />
      <ScanSearchIcon v-else class="size-5" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-base font-semibold"
        >{{ t('judging.check.title') }} · {{ block.round.name }} · {{ block.category.code }}</span
      >
      <span class="block truncate text-sm text-muted-foreground">
        {{ checkWhen(block)
        }}<template v-if="showTable && block.table"> · {{ block.table.name }}</template> ·
        {{ t('judging.check.teams', block.teams.length)
        }}<template v-if="done"> · {{ t('judging.check.done') }}</template>
      </span>
    </span>
    <ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
  </RouterLink>
</template>
