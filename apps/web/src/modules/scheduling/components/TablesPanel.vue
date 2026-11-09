<script setup lang="ts">
import { ref } from 'vue'
import { PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { CategoryRecord, TableRecord } from '@/shared/types/records'
import { deleteTable, saveTable } from '../api'

const props = defineProps<{
  eventId: string
  tables: TableRecord[]
  categories: CategoryRecord[]
  editable: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const editingId = ref<string>()
const form = ref({ name: '', active: true, categories: [] as string[] })

function startEdit(table?: TableRecord) {
  editingId.value = table?.id
  form.value = table
    ? { name: table.name, active: table.active, categories: [...table.categories] }
    : { name: '', active: true, categories: [] }
  save.reset()
}

const save = useSubmit(async () => {
  await saveTable(props.eventId, editingId.value, { ...form.value })
  startEdit()
  emit('changed')
})

const remove = useSubmit(async (table: TableRecord) => {
  await deleteTable(table.id)
  emit('changed')
})

function toggleCategory(id: string, checked: boolean) {
  const set = new Set(form.value.categories)
  if (checked) set.add(id)
  else set.delete(id)
  form.value.categories = [...set]
}

function categoryNames(table: TableRecord): string {
  if (table.categories.length === 0) return 'all categories'
  return table.categories
    .map((id) => props.categories.find((c) => c.id === id)?.name ?? '?')
    .join(', ')
}
</script>

<template>
  <Card>
    <CardHeader><CardTitle>Tables</CardTitle></CardHeader>
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="remove.error.value" />
      <ul v-if="tables.length" class="divide-y" data-testid="tables">
        <li v-for="table in tables" :key="table.id" class="flex items-center justify-between py-2">
          <span>
            <span class="font-medium">{{ table.name }}</span>
            <span class="text-muted-foreground"> · {{ categoryNames(table) }}</span>
            <span v-if="!table.active" class="ml-2 text-xs text-destructive">deactivated</span>
          </span>
          <span v-if="editable" class="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Edit ${table.name}`"
              @click="startEdit(table)"
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="`Delete ${table.name}`"
              @click="remove.run(table)"
            >
              <Trash2Icon />
            </Button>
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">No tables yet.</p>

      <form v-if="editable" class="flex flex-col gap-3" @submit.prevent="save.run()">
        <ErrorAlert :error="save.error.value" />
        <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormField
            v-slot="{ id }"
            label="Table name"
            name="name"
            :errors="save.fieldErrors.value"
          >
            <Input :id="id" v-model="form.name" required maxlength="100" />
          </FormField>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="form.active" type="checkbox" /> Active
          </label>
        </div>
        <fieldset class="flex flex-col gap-1 text-sm">
          <legend class="text-muted-foreground">Categories (none selected = all categories)</legend>
          <label v-for="category in categories" :key="category.id" class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="form.categories.includes(category.id)"
              @change="toggleCategory(category.id, ($event.target as HTMLInputElement).checked)"
            />
            {{ category.name }}
          </label>
        </fieldset>
        <div class="flex gap-2">
          <Button type="submit" :disabled="save.pending.value">
            <PlusIcon v-if="!editingId" /> {{ editingId ? 'Save table' : 'Add table' }}
          </Button>
          <Button v-if="editingId" type="button" variant="outline" @click="startEdit()">
            Cancel
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
