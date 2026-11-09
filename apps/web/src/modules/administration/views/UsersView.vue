<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useSessionStore } from '@/shared/auth/session'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import { ROLE_LABELS, type RoleAssignmentRecord } from '@/shared/types/records'
import { assignRole, listRoleAssignments, listUsers, removeRole, type AdminUser } from '../api'

const session = useSessionStore()
const search = ref('')

const { data, loading, error, load } = useLoader(async () => {
  const users = await listUsers(search.value)
  const roles = await listRoleAssignments({ users: users.items.map((u) => u.id) })
  return { users: users.items, total: users.total, roles }
})

const rolesByUser = computed(() => {
  const map = new Map<string, RoleAssignmentRecord[]>()
  for (const r of data.value?.roles ?? []) map.set(r.user, [...(map.get(r.user) ?? []), r])
  return map
})
const adminAssignment = (user: AdminUser) =>
  rolesByUser.value.get(user.id)?.find((r) => r.role === 'admin')

const toggleAdmin = useSubmit(async (user: AdminUser) => {
  const existing = adminAssignment(user)
  if (existing) await removeRole(existing.id)
  else await assignRole(user.id, 'admin')
  await load()
})

watchDebounced(search, load, { debounce: 300 })
onMounted(load)
</script>

<template>
  <PageHeader
    title="Users"
    description="Accounts and their roles. Event roles are assigned on each event's Staff tab."
  />
  <Input
    v-model="search"
    type="search"
    placeholder="Search by name or email"
    class="mb-4 max-w-sm"
    aria-label="Search users"
  />
  <ErrorAlert :error="error ?? toggleAdmin.error.value" />
  <Table data-testid="users">
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Email</TableHead>
        <TableHead>Roles</TableHead>
        <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="user in data?.users" :key="user.id">
        <TableCell>{{ user.name || '–' }}</TableCell>
        <TableCell>
          {{ user.email }}
          <Badge v-if="!user.verified" variant="outline">unverified</Badge>
        </TableCell>
        <TableCell class="flex flex-wrap gap-1">
          <Badge v-for="r in rolesByUser.get(user.id)" :key="r.id" variant="secondary">
            {{ ROLE_LABELS[r.role] }}
          </Badge>
        </TableCell>
        <TableCell>
          <Button
            v-if="user.id !== session.user?.id"
            size="sm"
            variant="outline"
            :disabled="toggleAdmin.pending.value"
            @click="toggleAdmin.run(user)"
          >
            {{ adminAssignment(user) ? 'Remove admin' : 'Make admin' }}
          </Button>
        </TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !data?.users.length" :colspan="4">No users found.</TableEmpty>
    </TableBody>
  </Table>
  <p v-if="data && data.total > data.users.length" class="mt-2 text-sm text-muted-foreground">
    Showing {{ data.users.length }} of {{ data.total }} users. Refine the search to find others.
  </p>
</template>
