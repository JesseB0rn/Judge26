<script setup lang="ts">
import { t } from '@/i18n'
import { computed } from 'vue'
import { CheckIcon, PackageCheckIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { formatDay, formatTimeOfDay } from '@/shared/format'
import { timeRange } from '../lib'
import type { TablePartsCheck } from '../types'

/**
 * A parts check in the judge's timeline (M10-16): the judge confirms that the parts check at
 * the table is done; the head judge then completes it for all tables.
 */
const props = defineProps<{
  entry: TablePartsCheck
  busy?: boolean
  readOnly?: boolean
  highlight?: boolean
  showTable?: boolean
}>()
const emit = defineEmits<{ confirm: [confirmed: boolean] }>()

const when = computed(() =>
  [
    props.entry.day ? props.entry.day.label || formatDay(props.entry.day.date) : '',
    timeRange(props.entry.starts_at, props.entry.duration_minutes),
    props.entry.place,
  ]
    .filter(Boolean)
    .join(' · '),
)
const done = computed(() => !!props.entry.confirmed_at || !!props.entry.completed_at)
</script>

<template>
  <div
    class="flex min-h-16 flex-wrap items-center gap-3 rounded-xl border px-3 py-2"
    :class="{ 'bg-sky-50/70': highlight }"
    :data-parts-check="entry.id"
    :data-done="done"
  >
    <span
      class="flex size-11 shrink-0 items-center justify-center rounded-lg"
      :class="done ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'"
    >
      <CheckIcon v-if="done" class="size-5" aria-hidden="true" />
      <PackageCheckIcon v-else class="size-5" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-base font-semibold break-words">{{ entry.title }}</span>
      <span class="block text-sm text-muted-foreground">
        {{ when }}<template v-if="showTable"> · {{ entry.table.name }}</template>
        <template v-if="entry.completed_at"> · {{ t('checks.parts.completed') }}</template>
        <template v-else-if="entry.confirmed_at">
          ·
          {{
            t('checks.parts.confirmedBy', {
              name: entry.confirmed_by?.name ?? '',
              time: formatTimeOfDay(entry.confirmed_at),
            })
          }}</template
        >
      </span>
    </span>
    <template v-if="!entry.completed_at && !readOnly">
      <Button
        v-if="!entry.confirmed_at"
        size="touch"
        :disabled="busy"
        data-testid="parts-confirm"
        @click="emit('confirm', true)"
        ><CheckIcon /> {{ t('checks.parts.confirm') }}</Button
      >
      <Button
        v-else
        variant="outline"
        size="touch"
        :disabled="busy"
        data-testid="parts-unconfirm"
        @click="emit('confirm', false)"
        >{{ t('judging.check.reopen') }}</Button
      >
    </template>
  </div>
</template>
