<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { DownloadIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { ROLE_LABELS, type EventRecord } from '@/shared/types/records'
import { parseStaffCsv, TEMPLATE_CSV } from '../import/staffCsv'
import {
  invite,
  previewInvitations,
  type InviteInput,
  type InviteResult,
  type InviteRowStatus,
} from '../invitations'

/**
 * Invite staff from a CSV of names and emails (M8-06): the server previews what each row would
 * do (new account, existing account, already staff, invalid, duplicate) before anything is saved.
 */
const props = defineProps<{ event: EventRecord }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ imported: [result: InviteResult] }>()

const input = ref<InviteInput[]>([])
const fileErrors = ref<string[]>([])
const result = ref<InviteResult>()

const STATUS_VARIANT: Record<InviteRowStatus, 'default' | 'secondary' | 'outline' | 'destructive'> =
  {
    invite: 'default',
    add: 'secondary',
    already: 'outline',
    duplicate: 'outline',
    invalid: 'destructive',
  }
const actionable = computed(
  () => (result.value?.counts.invite ?? 0) + (result.value?.counts.add ?? 0),
)

const check = useSubmit(async () => {
  result.value = await previewInvitations(props.event.id, input.value)
})

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const parsed = parseStaffCsv(await file.text())
  fileErrors.value = parsed.fileErrors
  input.value = parsed.rows
  result.value = undefined
  if (!parsed.fileErrors.length) await check.run()
}

const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`

const submit = useSubmit(async () => {
  const done = await invite(props.event.id, input.value)
  emit('imported', done)
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen) return
  input.value = []
  fileErrors.value = []
  result.value = undefined
  check.reset()
  submit.reset()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{
          t('administration.invite.importTitle', { event: event.name })
        }}</DialogTitle>
        <DialogDescription>{{ t('administration.invite.importDescription') }}</DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <FormField v-slot="{ id }" :label="t('administration.invite.file')" name="file">
          <Input
            :id="id"
            type="file"
            accept=".csv,text/csv"
            data-testid="staff-import-file"
            @change="onFile"
          />
        </FormField>
        <a
          :href="templateHref"
          download="staff-template.csv"
          class="inline-flex items-center gap-1 text-sm underline"
        >
          <DownloadIcon class="size-4" /> {{ t('administration.invite.example') }}
        </a>

        <ErrorAlert :error="check.error.value ?? submit.error.value" />
        <Alert v-for="msg in fileErrors" :key="msg" variant="destructive">
          <AlertDescription>{{ msg }}</AlertDescription>
        </Alert>

        <template v-if="result">
          <p class="text-sm" data-testid="staff-import-summary">
            {{
              t('administration.invite.summary', {
                invite: result.counts.invite ?? 0,
                add: result.counts.add ?? 0,
                skipped:
                  (result.counts.already ?? 0) +
                  (result.counts.duplicate ?? 0) +
                  (result.counts.invalid ?? 0),
              })
            }}
          </p>
          <Table data-testid="staff-import-rows">
            <TableHeader>
              <TableRow>
                <TableHead class="w-16">{{ t('teams.import.line') }}</TableHead>
                <TableHead>{{ t('common.name') }}</TableHead>
                <TableHead>{{ t('auth.email') }}</TableHead>
                <TableHead>{{ t('administration.staff.role') }}</TableHead>
                <TableHead>{{ t('common.status') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in result.rows" :key="row.line" :data-status="row.status">
                <TableCell>{{ row.line }}</TableCell>
                <TableCell>{{ row.name || '–' }}</TableCell>
                <TableCell>{{ row.email || '–' }}</TableCell>
                <TableCell>{{ ROLE_LABELS[row.role] ?? row.role }}</TableCell>
                <TableCell class="whitespace-normal">
                  <Badge :variant="STATUS_VARIANT[row.status]">{{
                    t(`administration.invite.rowStatus.${row.status}`)
                  }}</Badge>
                  <ul v-if="row.errors.length" class="text-xs text-destructive">
                    <li v-for="e in row.errors" :key="e">
                      {{ t(`administration.invite.errors.${e}`) }}
                    </li>
                  </ul>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </template>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button
          :disabled="!actionable || submit.pending.value || check.pending.value"
          @click="submit.run()"
        >
          {{ t('administration.invite.importSubmit', actionable) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
