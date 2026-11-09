<script setup lang="ts">
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
import type { CategoryRecord, EventRecord, TeamRecord, TeamStatus } from '@/shared/types/records'
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
const status = ref<TeamStatus>('submitted')
const result = ref<ImportResult>()

const validRows = computed(() => result.value?.rows.filter((r) => r.team) ?? [])
const invalidRows = computed(() => result.value?.rows.filter((r) => !r.team) ?? [])

function analyze() {
  const existingNames = new Map<string, Set<string>>()
  for (const t of props.teams) {
    const names = existingNames.get(t.category) ?? new Set()
    names.add(t.name.toLowerCase())
    existingNames.set(t.category, names)
  }
  result.value = parseTeamCsv(text.value, {
    categories: props.categories,
    existingNames,
    season: props.event.season,
    status: status.value,
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
  await importTeams(props.event.id, teams, status.value)
  emit('imported', teams.length)
  open.value = false
})

watch(status, () => text.value && analyze())
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
        <DialogTitle>Import teams from CSV</DialogTitle>
        <DialogDescription>
          Invalid rows are reported and skipped. Valid rows are imported together — if any of them
          is rejected by the server, nothing is imported.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField v-slot="{ id }" label="CSV file" name="file">
            <Input
              :id="id"
              type="file"
              accept=".csv,text/csv"
              data-testid="import-file"
              @change="onFile"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Initial status" name="status">
            <NativeSelect :id="id" v-model="status" class="w-full">
              <NativeSelectOption value="draft">Draft</NativeSelectOption>
              <NativeSelectOption value="submitted">Submitted</NativeSelectOption>
              <NativeSelectOption value="approved">Approved</NativeSelectOption>
            </NativeSelect>
          </FormField>
        </div>
        <a
          :href="templateHref"
          download="teams-template.csv"
          class="inline-flex items-center gap-1 text-sm underline"
        >
          <DownloadIcon class="size-4" /> Download example file
        </a>

        <ErrorAlert :error="submit.error.value" />
        <Alert v-for="msg in result?.fileErrors" :key="msg" variant="destructive">
          <AlertDescription>{{ msg }}</AlertDescription>
        </Alert>

        <template v-if="result && !result.fileErrors.length">
          <p class="text-sm" data-testid="import-summary">
            {{ validRows.length }} valid, {{ invalidRows.length }} invalid row(s).
          </p>
          <Table v-if="invalidRows.length" data-testid="import-errors">
            <TableHeader>
              <TableRow>
                <TableHead class="w-16">Line</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Problems</TableHead>
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
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button :disabled="!validRows.length || submit.pending.value" @click="submit.run()">
          Import {{ validRows.length }} team(s)
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
