<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  Trash2Icon,
  UploadIcon,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useFileToken } from '@/shared/composables/useFileToken'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import type { TeamDocumentRecord } from '@/shared/types/records'
import {
  defaultTitle,
  deleteTeamDocument,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  documentKind,
  documentUrl,
  listTeamDocuments,
  uploadTeamDocument,
} from '../documents'

/**
 * Documents of a team (M1-13): managers upload and delete them; the coach and event staff
 * open and download them.
 */
const props = defineProps<{ teamId: string; editable: boolean }>()

const { token } = useFileToken()
const { data, loading, error, load } = useLoader(() => listTeamDocuments([props.teamId]))
const docs = computed(() => data.value ?? [])

const file = ref<File | null>(null)
const title = ref('')
const input = ref<HTMLInputElement>()
const sizeError = ref('')

function onFile(event: Event) {
  const picked = (event.target as HTMLInputElement).files?.[0] ?? null
  sizeError.value =
    picked && picked.size > DOCUMENT_MAX_BYTES ? t('teams.documents.tooLarge', { max: 20 }) : ''
  file.value = sizeError.value ? null : picked
  if (picked && !title.value) title.value = defaultTitle(picked.name)
}

const upload = useSubmit(
  async () => {
    if (!file.value) return
    await uploadTeamDocument(props.teamId, title.value.trim(), file.value)
    file.value = null
    title.value = ''
    if (input.value) input.value.value = ''
    await load()
  },
  { success: () => t('teams.documents.uploaded') },
)

const remove = useSubmit(
  async (doc: TeamDocumentRecord) => {
    if (!confirm(t('common.confirmDeleteItem', { item: doc.title }))) return
    await deleteTeamDocument(doc.id)
    await load()
  },
  { success: () => t('teams.documents.deleted') },
)

const icons = { image: ImageIcon, pdf: FileTextIcon, other: FileIcon }

onMounted(load)
</script>

<template>
  <Card id="documents" class="max-w-3xl scroll-mt-4" data-testid="team-documents">
    <CardHeader>
      <CardTitle>{{ t('teams.documents.title') }}</CardTitle>
      <CardDescription>{{ t('teams.documents.visibility') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <ErrorAlert :error="error ?? remove.error.value" />

      <ul v-if="docs.length" class="flex flex-col divide-y rounded-lg border">
        <li
          v-for="doc in docs"
          :key="doc.id"
          class="flex items-center gap-3 px-3 py-2"
          :data-document="doc.title"
        >
          <component
            :is="icons[documentKind(doc.file)]"
            class="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <a
              :href="documentUrl(doc, token)"
              target="_blank"
              rel="noopener"
              class="block truncate font-medium hover:underline"
              >{{ doc.title }}</a
            >
            <span class="block truncate text-xs text-muted-foreground"
              >{{ doc.file }} · {{ formatDateTime(doc.created) }}</span
            >
          </span>
          <Button as-child size="icon" variant="ghost">
            <a
              :href="documentUrl(doc, token)"
              target="_blank"
              rel="noopener"
              :aria-label="t('common.openItem', { item: doc.title })"
              ><ExternalLinkIcon
            /></a>
          </Button>
          <Button as-child size="icon" variant="ghost">
            <a
              :href="documentUrl(doc, token, true)"
              :aria-label="t('common.downloadItem', { item: doc.title })"
              ><DownloadIcon
            /></a>
          </Button>
          <Button
            v-if="editable"
            size="icon"
            variant="ghost"
            :aria-label="t('common.deleteItem', { item: doc.title })"
            :disabled="remove.pending.value"
            @click="remove.run(doc)"
          >
            <Trash2Icon />
          </Button>
        </li>
      </ul>
      <p
        v-else-if="!loading"
        class="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground"
      >
        {{ t('teams.documents.empty') }}
      </p>

      <form
        v-if="editable"
        class="flex flex-col gap-3 sm:flex-row sm:items-end"
        data-testid="document-upload"
        @submit.prevent="upload.run()"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label for="document-file">{{ t('teams.documents.file', { max: 20 }) }}</Label>
          <input
            id="document-file"
            ref="input"
            type="file"
            :accept="DOCUMENT_ACCEPT"
            class="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            required
            @change="onFile"
          />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label for="document-title">{{ t('common.title') }}</Label>
          <Input id="document-title" v-model="title" required maxlength="100" />
        </div>
        <Button type="submit" :disabled="!file || !title.trim() || upload.pending.value">
          <UploadIcon /> {{ t('teams.documents.upload') }}
        </Button>
      </form>
      <p v-if="sizeError" class="text-sm text-destructive" role="alert">{{ sizeError }}</p>
      <ErrorAlert :error="upload.error.value" />
    </CardContent>
  </Card>
</template>
