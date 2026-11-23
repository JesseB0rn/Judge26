<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { LibraryIcon, PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import type { CategoryRecord, EventRecord } from '@/shared/types/records'
import { deleteCategory, listEventCategories, listTemplates } from '../api'
import CategoryFormDialog from './CategoryFormDialog.vue'
import CategoryRoundsGrid from './CategoryRoundsGrid.vue'
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
    if (!confirm(t('categories.confirmDelete', { code: c.code }))) return
    await deleteCategory(c.id)
    await load()
  },
  { success: () => t('categories.deleted') },
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
      <Button variant="outline" @click="addFromTemplate"
        ><LibraryIcon /> {{ t('categories.addFromTemplate') }}</Button
      >
      <Button @click="edit()"><PlusIcon /> {{ t('categories.form.newCategory') }}</Button>
    </div>
    <ErrorAlert :error="error ?? remove.error.value ?? templates.error.value" />
    <!-- M11-01: categories by rounds; the category library keeps CategoryTable. -->
    <CategoryRoundsGrid
      :event-id="event.id"
      :categories="categories"
      :loading="loading"
      :editable="editable"
      :show-ranking="session.isEventStaff(event.id)"
      :can-save-template="session.isAdmin"
      @edit="edit"
      @save-as-template="saveAsTemplate"
      @delete="remove.run"
    />

    <CategoryFormDialog
      v-model:open="formOpen"
      :category="editing"
      :event-id="event.id"
      @saved="load"
    />
    <CopyCategoryDialog
      v-model:open="fromTemplateOpen"
      :title="t('categories.addFromTemplateTitle')"
      :sources="templates.data.value"
      :target="event.id"
      @copied="load"
    />
    <CopyCategoryDialog
      v-model:open="toLibraryOpen"
      :title="t('categories.saveAsTemplate')"
      :source="toLibrarySource"
      target=""
    />
  </div>
</template>
