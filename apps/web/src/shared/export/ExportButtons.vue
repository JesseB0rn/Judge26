<script setup lang="ts">
import { DownloadIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { downloadTables, type ExportFormat } from './download'
import type { ExportTable } from './table'

/**
 * CSV and Excel download buttons (M7-05, M7-06). `tables` is called on click, so the export
 * always contains the data currently shown. CSV contains the first table only.
 */
const props = defineProps<{ title: string; tables: () => ExportTable[]; disabled?: boolean }>()

function download(format: ExportFormat) {
  try {
    downloadTables(props.title, format, props.tables())
  } catch (e) {
    toast.error(t('export.failed', { message: (e as Error).message }))
  }
}
</script>

<template>
  <div class="flex gap-1" role="group" :aria-label="t('export.label', { title })">
    <Button variant="outline" size="sm" :disabled="disabled" @click="download('csv')">
      <DownloadIcon /> CSV
    </Button>
    <Button variant="outline" size="sm" :disabled="disabled" @click="download('xlsx')">
      <DownloadIcon /> {{ t('export.excel') }}
    </Button>
  </div>
</template>
