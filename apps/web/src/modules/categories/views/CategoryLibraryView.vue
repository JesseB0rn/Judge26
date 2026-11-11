<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { listEvents } from '@/modules/events/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import type { CategoryRecord } from '@/shared/types/records'
import { deleteCategory, listTemplates } from '../api'
import CategoryFormDialog from '../components/CategoryFormDialog.vue'
import CategoryTable from '../components/CategoryTable.vue'
import CopyCategoryDialog from '../components/CopyCategoryDialog.vue'

const { data: templates, loading, error, load } = useLoader(listTemplates)
const events = useLoader(listEvents)
const targets = computed(() =>
  (events.data.value ?? [])
    .filter((e) => e.status !== 'archived')
    .map((e) => ({ id: e.id, label: `${e.name} (${e.season})` })),
)

const formOpen = ref(false)
const editing = ref<CategoryRecord>()
const copyOpen = ref(false)
const copySource = ref<CategoryRecord>()

const remove = useSubmit(
  async (c: CategoryRecord) => {
    if (!confirm(t('categories.library.confirmDelete', { code: c.code }))) return
    await deleteCategory(c.id)
    await load()
  },
  { success: () => t('categories.library.deleted') },
)

function edit(c?: CategoryRecord) {
  editing.value = c
  formOpen.value = true
}

async function copyToEvent(c: CategoryRecord) {
  copySource.value = c
  await events.load()
  copyOpen.value = true
}

onMounted(load)
</script>

<template>
  <PageHeader
    :title="t('system.dashboard.library')"
    :description="t('categories.library.description')"
  >
    <template #actions>
      <Button @click="edit()"><PlusIcon /> {{ t('categories.form.newTemplate') }}</Button>
    </template>
  </PageHeader>
  <ErrorAlert :error="error ?? remove.error.value ?? events.error.value" />
  <CategoryTable
    :categories="templates"
    :loading="loading"
    :empty="t('categories.library.empty')"
    show-ranking
  >
    <template #actions="{ category }">
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="t('categories.library.copyToEventOf', { code: category.code })"
        @click="copyToEvent(category)"
      >
        <CopyIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.editItem', { item: category.code })"
        @click="edit(category)"
      >
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.deleteItem', { item: category.code })"
        @click="remove.run(category)"
      >
        <Trash2Icon />
      </Button>
    </template>
  </CategoryTable>
  <CategoryFormDialog v-model:open="formOpen" :category="editing" event-id="" @saved="load" />
  <CopyCategoryDialog
    v-model:open="copyOpen"
    :title="t('categories.library.copyToEvent')"
    :source="copySource"
    :targets="targets"
  />
</template>
