<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import { MailIcon, Trash2Icon, UploadIcon, XIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
import FormField from '@/shared/components/FormField.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import { ROLE_LABELS, type EventRecord, type Role } from '@/shared/types/records'
import {
  invite,
  listStaff,
  removeStaff,
  resendInvitation,
  revokeInvitation,
  type InviteResult,
  type StaffMember,
  type StaffStatus,
} from '../invitations'
import StaffImportDialog from './StaffImportDialog.vue'

/**
 * Staff of an event (M8-B): who has which role, whether they accepted their invitation, and
 * inviting people one by one or from a CSV. Managers invite judges and head judges; admins also
 * event managers.
 */
const props = defineProps<{ event: EventRecord; editable: boolean }>()
const session = useSessionStore()
const roles = computed<Role[]>(() =>
  session.isAdmin ? ['event_manager', 'head_judge', 'judge'] : ['head_judge', 'judge'],
)

const { data: staff, loading, error, load } = useLoader(() => listStaff(props.event.id))
const form = reactive({ name: '', email: '', role: 'judge' as Role })
const importOpen = ref(false)

const STATUS_VARIANT: Record<StaffStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  invited: 'secondary',
  expired: 'destructive',
  revoked: 'outline',
}

/** Toast for the outcome of an invitation (one row or a file). */
function report(result: InviteResult) {
  const { invite: invited = 0, add: added = 0, already = 0 } = result.counts
  toast.success(t('administration.invite.result', { invited, added, already }))
}

const add = useSubmit(async () => {
  const result = await invite(props.event.id, [{ ...form }])
  const [row] = result.rows
  if (row?.status === 'invalid') {
    toast.error(row.errors.map((e) => t(`administration.invite.errors.${e}`)).join(' '))
    return
  }
  report(result)
  Object.assign(form, { name: '', email: '' })
  await load()
})
const remove = useSubmit(async (member: StaffMember) => {
  const name = member.user.name || member.user.email
  if (!confirm(t('administration.staff.confirmRemove', { name }))) return
  await removeStaff(props.event.id, member.id)
  await load()
})
const resend = useSubmit(
  async (member: StaffMember) => {
    await resendInvitation(member.invitation!.id)
    await load()
  },
  { success: () => t('administration.invite.resent') },
)
const revoke = useSubmit(
  async (member: StaffMember) => {
    await revokeInvitation(member.invitation!.id)
    await load()
  },
  { success: () => t('administration.invite.revoked') },
)

const canChange = (member: StaffMember) => props.editable && roles.value.includes(member.role)
const pending = computed(() => resend.pending.value || revoke.pending.value || remove.pending.value)

function onImported(result: InviteResult) {
  report(result)
  load()
}

onMounted(load)
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <div class="flex flex-col gap-2">
      <ErrorAlert
        :error="error ?? remove.error.value ?? resend.error.value ?? revoke.error.value"
      />
      <Table data-testid="event-staff">
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('common.name') }}</TableHead>
            <TableHead class="hidden sm:table-cell">{{ t('auth.email') }}</TableHead>
            <TableHead>{{ t('administration.staff.role') }}</TableHead>
            <TableHead>{{ t('common.status') }}</TableHead>
            <TableHead class="w-0"
              ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
            >
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="m in staff"
            :key="`${m.id}-${m.user.id}-${m.role}`"
            :data-staff="m.user.email"
          >
            <TableCell>{{ m.user.name || '–' }}</TableCell>
            <TableCell class="hidden sm:table-cell">{{ m.user.email }}</TableCell>
            <TableCell>{{ ROLE_LABELS[m.role] }}</TableCell>
            <TableCell>
              <Badge :variant="STATUS_VARIANT[m.status]" data-testid="staff-status">{{
                t(`administration.staff.status.${m.status}`)
              }}</Badge>
              <span
                v-if="m.status === 'invited' && m.invitation"
                class="block text-xs text-muted-foreground"
                >{{
                  t('administration.staff.validUntil', {
                    date: formatDateTime(m.invitation.expires_at),
                  })
                }}</span
              >
            </TableCell>
            <TableCell class="text-right whitespace-nowrap">
              <template v-if="canChange(m)">
                <Button
                  v-if="m.invitation && m.status !== 'active'"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="pending"
                  :aria-label="t('administration.invite.resend', { name: m.user.email })"
                  :title="t('administration.invite.resend', { name: m.user.email })"
                  @click="resend.run(m)"
                >
                  <MailIcon />
                </Button>
                <Button
                  v-if="m.invitation && (m.status === 'invited' || m.status === 'expired')"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="pending"
                  :aria-label="t('administration.invite.revoke', { name: m.user.email })"
                  :title="t('administration.invite.revoke', { name: m.user.email })"
                  @click="revoke.run(m)"
                >
                  <XIcon />
                </Button>
                <Button
                  v-else-if="m.id"
                  variant="ghost"
                  size="icon-sm"
                  :disabled="pending"
                  :aria-label="t('administration.staff.removeRole')"
                  :title="t('administration.staff.removeRole')"
                  @click="remove.run(m)"
                >
                  <Trash2Icon />
                </Button>
              </template>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!loading && !staff?.length" :colspan="5">{{
            t('administration.staff.empty')
          }}</TableEmpty>
        </TableBody>
      </Table>
    </div>
    <Card v-if="editable">
      <CardHeader>
        <CardTitle>{{ t('administration.invite.title') }}</CardTitle>
        <CardDescription>{{ t('administration.invite.description') }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <form class="flex flex-col gap-4" data-testid="invite-form" @submit.prevent="add.run()">
          <ErrorAlert :error="add.error.value" />
          <FormField v-slot="{ id }" :label="t('common.name')" name="name">
            <Input :id="id" v-model="form.name" required maxlength="200" autocomplete="off" />
          </FormField>
          <FormField v-slot="{ id }" :label="t('auth.email')" name="email">
            <Input :id="id" v-model="form.email" type="email" required autocomplete="off" />
          </FormField>
          <FormField v-slot="{ id }" :label="t('administration.staff.role')" name="role">
            <NativeSelect :id="id" v-model="form.role" class="w-full">
              <NativeSelectOption v-for="r in roles" :key="r" :value="r">{{
                ROLE_LABELS[r]
              }}</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <Button type="submit" :disabled="add.pending.value">{{
            t('administration.invite.submit')
          }}</Button>
        </form>
        <Button variant="outline" @click="importOpen = true">
          <UploadIcon /> {{ t('administration.invite.importButton') }}
        </Button>
      </CardContent>
    </Card>
    <StaffImportDialog
      v-if="editable"
      v-model:open="importOpen"
      :event="event"
      @imported="onImported"
    />
  </div>
</template>
