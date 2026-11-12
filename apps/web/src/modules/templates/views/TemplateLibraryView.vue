<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarPlusIcon, DownloadIcon, PencilIcon, Trash2Icon, UploadIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import type { EventRecord, EventTemplateRecord } from '@/shared/types/records'
import { deleteEventTemplate, listEventTemplates, uploadEventTemplate } from '../api'
import { downloadTemplate, templateSummary } from '../lib'
import EditTemplateDialog from '../components/EditTemplateDialog.vue'
import NewEventFromTemplateDialog from '../components/NewEventFromTemplateDialog.vue'

/** Template library (M8-24): upload, download, rename, delete, and start new events. */
const router = useRouter()
const { data: templates, loading, error, load } = useLoader(listEventTemplates)
const fileInput = ref<HTMLInputElement>()
const editing = ref<EventTemplateRecord>()
const editOpen = ref(false)
const creatingFrom = ref<string>()
const createOpen = ref(false)

const upload = useSubmit(
  async (file: File) => {
    await uploadEventTemplate(await file.text())
    await load()
  },
  { success: () => t('templates.library.uploaded') },
)

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await upload.run(file)
}

const remove = useSubmit(
  async (template: EventTemplateRecord) => {
    if (!confirm(t('templates.library.confirmDelete', { name: template.name }))) return
    await deleteEventTemplate(template.id)
    await load()
  },
  { success: () => t('templates.library.deleted') },
)

function edit(template: EventTemplateRecord) {
  editing.value = template
  editOpen.value = true
}

function newEvent(template: EventTemplateRecord) {
  creatingFrom.value = template.id
  createOpen.value = true
}

function onCreated(event: EventRecord) {
  router.push({ name: 'event', params: { id: event.id }, query: { tab: 'setup' } })
}

onMounted(load)
</script>

<template>
  <PageHeader
    :title="t('templates.library.title')"
    :description="t('templates.library.description')"
  >
    <template #actions>
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        class="hidden"
        data-testid="template-upload"
        @change="onFile"
      />
      <Button
        :disabled="upload.pending.value"
        :title="t('templates.library.uploadHint')"
        @click="fileInput?.click()"
      >
        <UploadIcon /> {{ t('templates.library.upload') }}
      </Button>
    </template>
  </PageHeader>
  <ErrorAlert
    :error="upload.error.value ?? error ?? remove.error.value"
    data-testid="template-error"
  />
  <Table data-testid="template-list">
    <TableHeader>
      <TableRow>
        <TableHead>{{ t('common.name') }}</TableHead>
        <TableHead>{{ t('templates.library.contents') }}</TableHead>
        <TableHead class="hidden md:table-cell">{{ t('templates.library.origin') }}</TableHead>
        <TableHead class="w-0"
          ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
        >
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="template in templates" :key="template.id" :data-template="template.name">
        <TableCell>
          <p class="font-medium">{{ template.name }}</p>
          <p v-if="template.description" class="text-sm text-muted-foreground">
            {{ template.description }}
          </p>
        </TableCell>
        <TableCell class="text-sm">
          {{ t('templates.library.days', templateSummary(template.data).days) }} ·
          {{ templateSummary(template.data).categories.join(', ') || '–' }} ·
          {{ t('templates.library.tables', templateSummary(template.data).tables) }}
        </TableCell>
        <TableCell class="hidden text-sm text-muted-foreground md:table-cell">
          {{ template.origin === 'upload' ? t('templates.library.fromUpload') : template.origin }}
        </TableCell>
        <TableCell class="text-right whitespace-nowrap">
          <Button variant="outline" size="sm" @click="newEvent(template)">
            <CalendarPlusIcon /> {{ t('templates.library.newEvent') }}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('templates.library.download', { name: template.name })"
            @click="downloadTemplate(template.data, template.name)"
          >
            <DownloadIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('templates.library.edit', { name: template.name })"
            @click="edit(template)"
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('templates.library.delete', { name: template.name })"
            @click="remove.run(template)"
          >
            <Trash2Icon />
          </Button>
        </TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !templates?.length" :colspan="4">{{
        t('templates.library.empty')
      }}</TableEmpty>
    </TableBody>
  </Table>
  <EditTemplateDialog v-model:open="editOpen" :template="editing" @saved="load" />
  <NewEventFromTemplateDialog
    v-model:open="createOpen"
    :template-id="creatingFrom"
    @created="onCreated"
  />
</template>
