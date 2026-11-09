<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { CheckIcon, UploadIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
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
import { listEventCategories } from '@/modules/categories/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useLoader, useSubmit } from '@/shared/composables/useSubmit'
import type { EventRecord, TeamRecord, TeamStatus } from '@/shared/types/records'
import { listEventTeams, updateTeam } from '../api'
import { TEAM_STATUS_LABELS } from '../lib'
import RejectDialog from './RejectDialog.vue'
import TeamImportDialog from './TeamImportDialog.vue'
import TeamStatusBadge from './TeamStatusBadge.vue'

/**
 * Teams of an event. Staff see all teams (managers can review and import);
 * coaches see only their own teams (enforced by the API).
 */
const props = defineProps<{ event: EventRecord; staff: boolean; canManage: boolean }>()

const { data: teams, loading, error, load } = useLoader(() => listEventTeams(props.event.id))
const categories = useLoader(() => listEventCategories(props.event.id))
const statusFilter = ref<TeamStatus | ''>('')
const categoryFilter = ref('')
const rejecting = ref<TeamRecord>()
const rejectOpen = ref(false)
const importOpen = ref(false)

const filtered = computed(() =>
  (teams.value ?? []).filter(
    (t) =>
      (!statusFilter.value || t.status === statusFilter.value) &&
      (!categoryFilter.value || t.category === categoryFilter.value),
  ),
)

const approve = useSubmit(
  async (team: TeamRecord) => {
    await updateTeam(team.id, { status: 'approved' })
    await load()
  },
  { success: 'Registration approved.' },
)

function reject(team: TeamRecord) {
  rejecting.value = team
  rejectOpen.value = true
}

function onImported(count: number) {
  toast.success(`${count} team(s) imported.`)
  load()
}

onMounted(() => Promise.all([load(), categories.load()]))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end gap-2">
      <NativeSelect v-model="statusFilter" aria-label="Filter by status">
        <NativeSelectOption value="">All statuses</NativeSelectOption>
        <NativeSelectOption
          v-for="(label, value) in TEAM_STATUS_LABELS"
          :key="value"
          :value="value"
        >
          {{ label }}
        </NativeSelectOption>
      </NativeSelect>
      <NativeSelect v-model="categoryFilter" aria-label="Filter by category">
        <NativeSelectOption value="">All categories</NativeSelectOption>
        <NativeSelectOption v-for="c in categories.data.value" :key="c.id" :value="c.id">
          {{ c.code }}
        </NativeSelectOption>
      </NativeSelect>
      <Button v-if="canManage" variant="outline" class="ml-auto" @click="importOpen = true">
        <UploadIcon /> Import CSV
      </Button>
    </div>

    <ErrorAlert :error="error ?? approve.error.value" />
    <p v-if="!staff" class="text-sm text-muted-foreground">You see the teams you registered.</p>

    <Table data-testid="event-teams">
      <TableHeader>
        <TableRow>
          <TableHead>Team</TableHead>
          <TableHead>Category</TableHead>
          <TableHead class="hidden md:table-cell">Organization</TableHead>
          <TableHead class="hidden lg:table-cell">Coach</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Status</TableHead>
          <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="team in filtered" :key="team.id" :data-team="team.name">
          <TableCell class="font-medium">
            <RouterLink :to="{ name: 'team', params: { id: team.id } }" class="hover:underline">
              {{ team.name }}
            </RouterLink>
          </TableCell>
          <TableCell class="font-mono">{{ team.expand?.category?.code }}</TableCell>
          <TableCell class="hidden md:table-cell">{{ team.organization || '–' }}</TableCell>
          <TableCell class="hidden lg:table-cell">{{
            team.coach_name || team.coach_email
          }}</TableCell>
          <TableCell>{{ team.members?.length ?? 0 }}</TableCell>
          <TableCell><TeamStatusBadge :status="team.status" /></TableCell>
          <TableCell class="text-right whitespace-nowrap">
            <template
              v-if="canManage && (team.status === 'submitted' || team.status === 'rejected')"
            >
              <Button
                size="sm"
                variant="outline"
                :disabled="approve.pending.value"
                @click="approve.run(team)"
              >
                <CheckIcon /> Approve
              </Button>
            </template>
            <Button
              v-if="canManage && (team.status === 'submitted' || team.status === 'approved')"
              size="sm"
              variant="ghost"
              @click="reject(team)"
            >
              <XIcon /> Reject
            </Button>
          </TableCell>
        </TableRow>
        <TableEmpty v-if="!loading && !filtered.length" :colspan="7">No teams.</TableEmpty>
      </TableBody>
    </Table>

    <RejectDialog v-model:open="rejectOpen" :team="rejecting" @rejected="load" />
    <TeamImportDialog
      v-if="canManage"
      v-model:open="importOpen"
      :event="event"
      :categories="categories.data.value ?? []"
      :teams="teams ?? []"
      @imported="onImported"
    />
  </div>
</template>
