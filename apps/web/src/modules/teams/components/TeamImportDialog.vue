<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { DownloadIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { CategoryRecord, EventRecord, TeamRecord } from '@/shared/types/records'
import { importTeams } from '../api'
import { parseTeamCsv, TEMPLATE_CSV, type ImportResult } from '../import/csv'

const props = defineProps<{
  event: EventRecord
  categories: CategoryRecord[]
  teams: TeamRecord[]
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ imported: [count: number] }>()

const text = ref('')
const result = ref<ImportResult>()

const validRows = computed(() => result.value?.rows.filter((r) => r.team) ?? [])
const invalidRows = computed(() => result.value?.rows.filter((r) => !r.team) ?? [])

function analyze() {
  const existingNames = new Map<string, Set<string>>()
  for (const team of props.teams) {
    const names = existingNames.get(team.category) ?? new Set()
    names.add(team.name.toLowerCase())
    existingNames.set(team.category, names)
  }
  result.value = parseTeamCsv(text.value, {
    categories: props.categories,
    existingNames,
    season: props.event.season,
  })
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  text.value = await file.text()
  analyze()
}

const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`

const submit = useSubmit(async () => {
  const teams = validRows.value.map((r) => r.team!)
  await importTeams(props.event.id, teams)
  emit('imported', teams.length)
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen) return
  text.value = ''
  result.value = undefined
  submit.reset()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ t('teams.import.title') }}</DialogTitle>
        <DialogDescription>{{ t('teams.import.description') }}</DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <FormField v-slot="{ id }" :label="t('teams.import.file')" name="file">
          <Input
            :id="id"
            type="file"
            accept=".csv,text/csv"
            data-testid="import-file"
            @change="onFile"
          />
        </FormField>
        <a
          :href="templateHref"
          download="teams-template.csv"
          class="inline-flex items-center gap-1 text-sm underline"
        >
          <DownloadIcon class="size-4" /> {{ t('teams.import.example') }}
        </a>

        <ErrorAlert :error="submit.error.value" />
        <Alert v-for="msg in result?.fileErrors" :key="msg" variant="destructive">
          <AlertDescription>{{ msg }}</AlertDescription>
        </Alert>

        <template v-if="result && !result.fileErrors.length">
          <p class="text-sm" data-testid="import-summary">
            {{
              t('teams.import.summary', {
                valid: validRows.length,
                invalid: invalidRows.length,
              })
            }}
          </p>
          <Table v-if="invalidRows.length" data-testid="import-errors">
            <TableHeader>
              <TableRow>
                <TableHead class="w-16">{{ t('teams.import.line') }}</TableHead>
                <TableHead>{{ t('teams.team') }}</TableHead>
                <TableHead>{{ t('teams.import.problems') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in invalidRows" :key="row.line">
                <TableCell>{{ row.line }}</TableCell>
                <TableCell>{{ row.name || '–' }}</TableCell>
                <TableCell class="whitespace-normal text-destructive">
                  <ul>
                    <li v-for="e in row.errors" :key="e">{{ e }}</li>
                  </ul>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </template>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button :disabled="!validRows.length || submit.pending.value" @click="submit.run()">
          {{ t('teams.import.submit', validRows.length) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
