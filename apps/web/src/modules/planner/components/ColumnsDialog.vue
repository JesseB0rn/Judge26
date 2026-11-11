<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref } from 'vue'
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { createColumn, deleteColumn, updateColumn } from '../api'
import type { PlannerColumn } from '../types'

/**
 * Custom columns next to the categories (M4-14-33), e.g. visitors or coaches: add, rename,
 * reorder, show to the public or keep internal, and delete (only while empty).
 */
const props = defineProps<{ eventId: string; columns: PlannerColumn[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()

const ordered = computed(() =>
  [...props.columns].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
)
const name = ref('')
const isPublic = ref(true)

const add = useSubmit(async () => {
  const position = Math.max(-1, ...props.columns.map((c) => c.position)) + 1
  await createColumn(props.eventId, { name: name.value.trim(), position, public: isPublic.value })
  name.value = ''
  emit('changed')
})

const change = useSubmit(async (column: PlannerColumn, data: Partial<PlannerColumn>) => {
  if (data.name !== undefined && (!data.name.trim() || data.name === column.name)) return
  await updateColumn(column.id, data)
  emit('changed')
})

/** Swaps the column with its neighbour; positions are renumbered in display order. */
const move = useSubmit(async (index: number, offset: number) => {
  const list = [...ordered.value]
  const target = index + offset
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target]!, list[index]!]
  for (const [i, column] of list.entries()) {
    if (column.position !== i) await updateColumn(column.id, { position: i })
  }
  emit('changed')
})

const remove = useSubmit(async (column: PlannerColumn) => {
  if (!confirm(t('planner.columns.confirmDelete', { column: column.name }))) return
  await deleteColumn(column.id)
  emit('changed')
})

const error = computed(
  () => add.error.value ?? change.error.value ?? move.error.value ?? remove.error.value,
)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('planner.columns.title') }}</DialogTitle>
        <DialogDescription>{{ t('planner.columns.description') }}</DialogDescription>
      </DialogHeader>
      <ErrorAlert :error="error" />
      <ul v-if="ordered.length" class="flex flex-col gap-2" data-testid="custom-columns">
        <li v-for="(column, i) in ordered" :key="column.id" class="flex items-center gap-2">
          <Input
            class="h-8 flex-1"
            :model-value="column.name"
            maxlength="60"
            :aria-label="t('planner.columns.nameOf', { column: column.name })"
            @change="change.run(column, { name: ($event.target as HTMLInputElement).value })"
          />
          <label class="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              :checked="column.public"
              @change="change.run(column, { public: ($event.target as HTMLInputElement).checked })"
            />
            {{ t('live.publication.public') }}
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="i === 0"
            :aria-label="t('planner.columns.left', { column: column.name })"
            @click="move.run(i, -1)"
            ><ArrowLeftIcon
          /></Button>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="i === ordered.length - 1"
            :aria-label="t('planner.columns.right', { column: column.name })"
            @click="move.run(i, 1)"
            ><ArrowRightIcon
          /></Button>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('common.deleteItem', { item: column.name })"
            @click="remove.run(column)"
            ><Trash2Icon
          /></Button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">{{ t('planner.columns.empty') }}</p>
      <form class="flex flex-wrap items-center gap-2" @submit.prevent="add.run()">
        <Input
          v-model="name"
          class="h-8 min-w-40 flex-1"
          maxlength="60"
          required
          :placeholder="t('planner.columns.placeholder')"
          :aria-label="t('planner.columns.newName')"
        />
        <label class="flex items-center gap-1 text-xs">
          <input v-model="isPublic" type="checkbox" class="size-4 accent-primary" />
          {{ t('live.publication.public') }}
        </label>
        <Button type="submit" size="sm" :disabled="add.pending.value || !name.trim()"
          ><PlusIcon /> {{ t('planner.columns.add') }}</Button
        >
      </form>
      <p class="text-xs text-muted-foreground">{{ t('planner.columns.hint') }}</p>
      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">{{
          t('planner.done')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
