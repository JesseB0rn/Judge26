<script setup lang="ts">
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
  { success: 'Role assigned.' },
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
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
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
                :aria-label="`Remove role`"
                @click="remove.run(a.id)"
              >
                <Trash2Icon />
              </Button>
            </TableCell>
          </TableRow>
          <TableEmpty v-if="!loading && !staff?.length" :colspan="4">No staff assigned.</TableEmpty>
        </TableBody>
      </Table>
    </div>
    <Card>
      <CardHeader><CardTitle>Assign role</CardTitle></CardHeader>
      <CardContent>
        <form class="flex flex-col gap-4" @submit.prevent="add.run()">
          <ErrorAlert :error="add.error.value" />
          <FormField
            v-slot="{ id }"
            label="User email"
            name="email"
            :errors="add.fieldErrors.value"
            description="The user must already have an account."
          >
            <Input :id="id" v-model="email" type="email" required />
          </FormField>
          <FormField v-slot="{ id }" label="Role" name="role" :errors="add.fieldErrors.value">
            <NativeSelect :id="id" v-model="role" class="w-full">
              <NativeSelectOption v-for="r in EVENT_ROLES" :key="r" :value="r">{{
                ROLE_LABELS[r]
              }}</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <Button type="submit" :disabled="add.pending.value">Assign</Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
