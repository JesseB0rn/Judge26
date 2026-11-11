<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { ROLE_LABELS, type EventRecord, type Role } from '@/shared/types/records'
import { assignRoleByEmail, listRoleAssignments, removeRole } from '../api'

const props = defineProps<{ event: EventRecord }>()
const EVENT_ROLES: Role[] = ['event_manager', 'head_judge', 'judge']

const {
  data: staff,
  loading,
  error,
  load,
} = useLoader(() => listRoleAssignments({ event: props.event.id }))
const email = ref('')
const role = ref<Role>('judge')

const add = useSubmit(
  async () => {
    await assignRoleByEmail(email.value, role.value, props.event.id)
    email.value = ''
    await load()
  },
  { success: () => t('administration.staff.assigned') },
)
const remove = useSubmit(async (id: string) => {
  await removeRole(id)
  await load()
})

onMounted(load)
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <div class="flex flex-col gap-2">
      <ErrorAlert :error="error ?? remove.error.value" />
      <Table data-testid="event-staff">
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('common.name') }}</TableHead>
            <TableHead>{{ t('auth.email') }}</TableHead>
            <TableHead>{{ t('administration.staff.role') }}</TableHead>
            <TableHead class="w-0"
              ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
            >
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="a in staff" :key="a.id">
            <TableCell>{{ a.expand?.user?.name || '–' }}</TableCell>
            <TableCell>{{ a.expand?.user?.email }}</TableCell>
            <TableCell>{{ ROLE_LABELS[a.role] }}</TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon-sm"
                :aria-label="t('administration.staff.removeRole')"
                @click="remove.run(a.id)"
              >
                <Trash2Icon />
              </Button>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!loading && !staff?.length" :colspan="4">{{
            t('administration.staff.empty')
          }}</TableEmpty>
        </TableBody>
      </Table>
    </div>
    <Card>
      <CardHeader
        ><CardTitle>{{ t('administration.staff.assign') }}</CardTitle></CardHeader
      >
      <CardContent>
        <form class="flex flex-col gap-4" @submit.prevent="add.run()">
          <ErrorAlert :error="add.error.value" />
          <FormField
            v-slot="{ id }"
            :label="t('administration.staff.userEmail')"
            name="email"
            :errors="add.fieldErrors.value"
            :description="t('administration.staff.userEmailHint')"
          >
            <Input :id="id" v-model="email" type="email" required />
          </FormField>
          <FormField
            v-slot="{ id }"
            :label="t('administration.staff.role')"
            name="role"
            :errors="add.fieldErrors.value"
          >
            <NativeSelect :id="id" v-model="role" class="w-full">
              <NativeSelectOption v-for="r in EVENT_ROLES" :key="r" :value="r">{{
                ROLE_LABELS[r]
              }}</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <Button type="submit" :disabled="add.pending.value">{{
            t('administration.staff.submit')
          }}</Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
