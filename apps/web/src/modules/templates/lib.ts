import { downloadBlob } from '@/shared/export/download'
import { slug } from '@/shared/export/table'
import type { EventTemplateFile } from '@/shared/types/records'

/** "event-template-<name>.json" */
export function templateFilename(name: string) {
  return `event-template-${slug(name)}.json`
}

/** Offers a template file for download (M8-22). */
export function downloadTemplate(file: EventTemplateFile, name = file.name) {
  const blob = new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' })
  downloadBlob(templateFilename(name), blob)
}

/** Category codes of a template, for the library list. */
export function templateSummary(file: EventTemplateFile | undefined) {
  return {
    days: file?.days?.length ?? 0,
    categories: (file?.categories ?? []).map((c) => c.code),
    tables: file?.tables?.length ?? 0,
  }
}
