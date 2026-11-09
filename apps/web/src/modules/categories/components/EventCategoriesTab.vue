<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CopyIcon, LibraryIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import type { CategoryRecord, EventRecord } from '@/shared/types/records'
import { deleteCategory, listEventCategories, listTemplates } from '../api'
import CategoryFormDialog from './CategoryFormDialog.vue'
import CategoryTable from './CategoryTable.vue'
import CopyCategoryDialog from './CopyCategoryDialog.vue'

const props = defineProps<{ event: EventRecord; editable: boolean }>()
const session = useSessionStore()

const {
  data: categories,
  loading,
  error,
  load,
} = useLoader(() => listEventCategories(props.event.id))
const templates = useLoader(listTemplates)

const formOpen = ref(false)
const editing = ref<CategoryRecord>()
const fromTemplateOpen = ref(false)
const toLibraryOpen = ref(false)
const toLibrarySource = ref<CategoryRecord>()

const remove = useSubmit(
  async (c: CategoryRecord) => {
    if (!confirm(`Delete category ${c.code}?`)) return
    await deleteCategory(c.id)
    await load()
  },
  { success: 'Category deleted.' },
)

function edit(c?: CategoryRecord) {
  editing.value = c
  formOpen.value = true
}

async function addFromTemplate() {
  await templates.load()
  fromTemplateOpen.value = true
}

function saveAsTemplate(c: CategoryRecord) {
  toLibrarySource.value = c
  toLibraryOpen.value = true
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="editable" class="flex flex-wrap justify-end gap-2">
      <Button variant="outline" @click="addFromTemplate"><LibraryIcon /> Add from template</Button>
      <Button @click="edit()"><PlusIcon /> New category</Button>
    </div>
    <ErrorAlert :error="error ?? remove.error.value ?? templates.error.value" />
    <CategoryTable
      :categories="categories"
      :loading="loading"
      empty="No categories yet."
      :show-ranking="session.isEventStaff(event.id)"
    >
      <template #actions="{ category }">
        <template v-if="editable">
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="`Edit ${category.code}`"
            @click="edit(category)"
          >
            <PencilIcon />
          </Button>
          <Button
            v-if="session.isAdmin"
            variant="ghost"
            size="icon-sm"
            :aria-label="`Save ${category.code} as template`"
            @click="saveAsTemplate(category)"
          >
            <CopyIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="`Delete ${category.code}`"
            @click="remove.run(category)"
          >
            <Trash2Icon />
          </Button>
        </template>
      </template>
    </CategoryTable>

    <CategoryFormDialog
      v-model:open="formOpen"
      :category="editing"
      :event-id="event.id"
      @saved="load"
    />
    <CopyCategoryDialog
      v-model:open="fromTemplateOpen"
      title="Add category from template"
      :sources="templates.data.value"
      :target="event.id"
      @copied="load"
    />
    <CopyCategoryDialog
      v-model:open="toLibraryOpen"
      title="Save as template"
      :source="toLibrarySource"
      target=""
    />
  </div>
</template>
