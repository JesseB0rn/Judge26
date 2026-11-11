<script setup lang="ts">
import { t } from '@/i18n'
import { computed, reactive, watch } from 'vue'
import { CopyIcon, Trash2Icon } from '@lucide/vue'
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDay } from '@/shared/format'
import { createBlock, deleteBlock, isConflict, updateBlock, type BlockInput } from '../api'
import { dayName, MIN_BLOCK_MINUTES, SWATCH_CLASSES, timeRange } from '../lib'
import {
  BLOCK_COLORS,
  type PlannerBlock,
  type PlannerCategory,
  type PlannerColumn,
  type PlannerDay,
} from '../types'

/** Create, edit, duplicate or delete a custom block (M4-14-03, M4-14-18); details when read-only. */
const props = defineProps<{
  eventId: string
  /** The block being edited, or a draft for a new block (no id). */
  block: (Partial<PlannerBlock> & Pick<PlannerBlock, 'day' | 'starts_at'>) | null
  days: PlannerDay[]
  categories: PlannerCategory[]
  /** Custom columns (M4-14-33). */
  customColumns?: PlannerColumn[]
  editable: boolean
  internal?: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [block: PlannerBlock]; deleted: [id: string]; conflict: [] }>()

const form = reactive<BlockInput>({
  day: '',
  starts_at: '',
  duration_minutes: 30,
  title: '',
  place: '',
  color: 'slate',
  responsibility: '',
  categories: [],
  columns: [],
  public: true,
})
const isNew = computed(() => !props.block?.id)

function fill() {
  if (!props.block) return
  save.reset()
  remove.reset()
  const b = props.block
  Object.assign(form, {
    day: b.day,
    starts_at: b.starts_at,
    duration_minutes: b.duration_minutes ?? 30,
    title: b.title ?? '',
    place: b.place ?? '',
    color: b.color || 'slate',
    responsibility: b.responsibility ?? '',
    categories: [...(b.categories ?? [])],
    columns: [...(b.columns ?? [])],
    public: b.public ?? true,
  })
}

function guard<T>(action: () => Promise<T>) {
  return async () => {
    try {
      return await action()
    } catch (error) {
      if (isConflict(error)) emit('conflict')
      throw error
    }
  }
}

const save = useSubmit(
  guard(async () => {
    const data = { ...form }
    const saved =
      props.block?.id && props.block.updated !== undefined
        ? await updateBlock({ id: props.block.id, updated: props.block.updated }, data)
        : await createBlock(props.eventId, data)
    emit('saved', saved)
    open.value = false
  }),
)

/** Duplicates the block with the form's values (e.g. to another day). */
const duplicate = useSubmit(async () => {
  const saved = await createBlock(props.eventId, { ...form })
  emit('saved', saved)
  open.value = false
})

const remove = useSubmit(async () => {
  if (!props.block?.id || !confirm(t('common.confirmDeleteItem', { item: props.block.title })))
    return
  await deleteBlock(props.block.id)
  emit('deleted', props.block.id)
  open.value = false
})

// Fill the form when the dialog opens (also already open on a deep link) or shows another
// block; a live reload of the same block does not overwrite what is being typed.
watch(
  () => (open.value && props.block ? props.block.id || 'new' : ''),
  (key) => {
    if (key) fill()
  },
  { immediate: true },
)

function toggleColumn(id: string, checked: boolean) {
  const all = (props.customColumns ?? []).map((c) => c.id)
  form.columns = checked
    ? all.filter((c) => c === id || form.columns.includes(c))
    : form.columns.filter((c) => c !== id)
}

function toggleCategory(id: string, checked: boolean) {
  form.categories = checked
    ? props.categories.map((c) => c.id).filter((c) => c === id || form.categories.includes(c))
    : form.categories.filter((c) => c !== id)
}

const coverage = computed(() => {
  const ids = [...(props.block?.categories ?? []), ...(props.block?.columns ?? [])]
  if (!ids.length) return t('planner.block.allColumns')
  return [...props.categories, ...(props.customColumns ?? [])]
    .filter((c) => ids.includes(c.id))
    .map((c) => c.name)
    .join(', ')
})
const error = computed(() => save.error.value ?? duplicate.error.value ?? remove.error.value)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{
          editable
            ? isNew
              ? t('planner.block.new')
              : t('planner.block.edit')
            : (block?.title ?? t('planner.block.block'))
        }}</DialogTitle>
        <DialogDescription v-if="editable">
          {{ t('planner.block.description') }}
        </DialogDescription>
      </DialogHeader>

      <dl v-if="!editable && block" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">{{ t('teams.mine.when') }}</dt>
        <dd>
          {{ dayName(days.find((d) => d.id === block?.day)) }},
          {{ timeRange(block.starts_at, block.duration_minutes ?? 0) }}
        </dd>
        <template v-if="block.place">
          <dt class="text-muted-foreground">{{ t('planner.block.place') }}</dt>
          <dd>{{ block.place }}</dd>
        </template>
        <template v-if="block.responsibility">
          <dt class="text-muted-foreground">{{ t('planner.block.responsible') }}</dt>
          <dd>{{ block.responsibility }}</dd>
        </template>
        <dt class="text-muted-foreground">{{ t('planner.block.columns') }}</dt>
        <dd>{{ coverage }}</dd>
        <template v-if="internal">
          <dt class="text-muted-foreground">{{ t('planner.block.visibility') }}</dt>
          <dd>{{ block.public ? t('live.publication.public') : t('planner.internal') }}</dd>
        </template>
      </dl>

      <form v-else id="block-form" class="flex flex-col gap-4" @submit.prevent="save.run()">
        <ErrorAlert :error="error" />
        <FormField
          v-slot="{ id }"
          :label="t('common.title')"
          name="title"
          :errors="save.fieldErrors.value"
        >
          <Input
            :id="id"
            v-model="form.title"
            required
            maxlength="100"
            :placeholder="t('planner.block.titlePlaceholder')"
          />
        </FormField>
        <div class="grid gap-4 sm:grid-cols-3">
          <FormField
            v-slot="{ id }"
            :label="t('scheduling.export.day')"
            name="day"
            :errors="save.fieldErrors.value"
          >
            <NativeSelect :id="id" v-model="form.day" class="w-full" required>
              <NativeSelectOption v-for="d in days" :key="d.id" :value="d.id">{{
                d.label ? `${d.label} (${formatDay(d.date)})` : formatDay(d.date)
              }}</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField
            v-slot="{ id }"
            :label="t('planner.start')"
            name="starts_at"
            :errors="save.fieldErrors.value"
          >
            <Input :id="id" v-model="form.starts_at" type="time" step="300" required />
          </FormField>
          <FormField
            v-slot="{ id }"
            :label="t('planner.durationMin')"
            name="duration_minutes"
            :errors="save.fieldErrors.value"
          >
            <Input
              :id="id"
              v-model.number="form.duration_minutes"
              type="number"
              :min="MIN_BLOCK_MINUTES"
              max="1440"
              step="5"
              required
            />
          </FormField>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField
            v-slot="{ id }"
            :label="t('planner.block.place')"
            name="place"
            :errors="save.fieldErrors.value"
          >
            <Input
              :id="id"
              v-model="form.place"
              maxlength="100"
              :placeholder="t('planner.block.placePlaceholder')"
            />
          </FormField>
          <FormField
            v-slot="{ id }"
            :label="t('planner.block.responsibility')"
            name="responsibility"
            :errors="save.fieldErrors.value"
          >
            <Input
              :id="id"
              v-model="form.responsibility"
              maxlength="200"
              :placeholder="t('planner.block.responsibilityPlaceholder')"
            />
          </FormField>
        </div>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium">{{ t('planner.block.columns') }}</legend>
          <p class="text-xs text-muted-foreground">{{ t('planner.block.columnsHint') }}</p>
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            <label
              v-for="category in categories"
              :key="category.id"
              class="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                class="size-4 accent-primary"
                :checked="form.categories.includes(category.id)"
                @change="toggleCategory(category.id, ($event.target as HTMLInputElement).checked)"
              />
              {{ category.name }}
            </label>
            <label
              v-for="column in customColumns ?? []"
              :key="column.id"
              class="flex items-center gap-2 text-sm italic"
            >
              <input
                type="checkbox"
                class="size-4 accent-primary"
                :checked="form.columns.includes(column.id)"
                @change="toggleColumn(column.id, ($event.target as HTMLInputElement).checked)"
              />
              {{ column.name }}
            </label>
          </div>
          <p v-if="save.fieldErrors.value.categories" class="text-sm text-destructive">
            {{ save.fieldErrors.value.categories }}
          </p>
          <p v-if="save.fieldErrors.value.columns" class="text-sm text-destructive">
            {{ save.fieldErrors.value.columns }}
          </p>
        </fieldset>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium">{{ t('planner.block.color') }}</legend>
          <div
            class="flex flex-wrap gap-2"
            role="radiogroup"
            :aria-label="t('planner.block.color')"
          >
            <label v-for="color in BLOCK_COLORS" :key="color" class="cursor-pointer">
              <input v-model="form.color" type="radio" :value="color" class="peer sr-only" />
              <span
                class="block size-7 rounded-full border-2 border-transparent ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-ring peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                :class="SWATCH_CLASSES[color]"
                :title="color"
              />
              <span class="sr-only">{{ color }}</span>
            </label>
          </div>
        </fieldset>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="form.public" type="checkbox" class="size-4 accent-primary" />
          {{ t('planner.block.publicHint') }}
        </label>
      </form>

      <DialogFooter v-if="editable" class="gap-2 sm:justify-between">
        <div class="flex gap-2">
          <Button
            v-if="!isNew"
            type="button"
            variant="outline"
            :disabled="remove.pending.value"
            @click="remove.run()"
            ><Trash2Icon /> {{ t('planner.block.delete') }}</Button
          >
          <Button
            v-if="!isNew"
            type="button"
            variant="outline"
            :disabled="duplicate.pending.value"
            :title="t('planner.block.duplicateHint')"
            @click="duplicate.run()"
            ><CopyIcon /> {{ t('planner.block.duplicate') }}</Button
          >
        </div>
        <div class="flex gap-2">
          <Button type="button" variant="outline" @click="open = false">{{
            t('common.cancel')
          }}</Button>
          <Button type="submit" form="block-form" :disabled="save.pending.value">{{
            t('common.save')
          }}</Button>
        </div>
      </DialogFooter>
      <DialogFooter v-else>
        <Button type="button" variant="outline" @click="open = false">{{
          t('planner.close')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
