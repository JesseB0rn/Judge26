<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from '@lucide/vue'
import { TableHead } from '@/components/ui/table'
import type { SortDirection } from '@/shared/composables/useSort'

/** A column header that sorts the table when clicked (see useSort). */
const props = defineProps<{
  direction?: SortDirection
  class?: HTMLAttributes['class']
}>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <TableHead
    :class="props.class"
    :aria-sort="direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined"
  >
    <button
      type="button"
      class="-mx-2 inline-flex h-8 items-center gap-1 rounded-md px-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      @click="$emit('toggle')"
    >
      <slot />
      <ArrowUpIcon v-if="direction === 'asc'" class="size-3.5" aria-hidden="true" />
      <ArrowDownIcon v-else-if="direction === 'desc'" class="size-3.5" aria-hidden="true" />
      <ArrowUpDownIcon v-else class="size-3.5 text-muted-foreground/60" aria-hidden="true" />
    </button>
  </TableHead>
</template>
