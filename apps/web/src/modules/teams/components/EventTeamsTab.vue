<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { PaperclipIcon, PlusIcon, UploadIcon } from '@lucide/vue'
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
import ExportButtons from '@/shared/export/ExportButtons.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import type { EventRecord, TeamStatus } from '@/shared/types/records'
import { listEventTeams } from '../api'
import { listEventTeamDocuments } from '../documents'
import { CURRENT_STATUSES, TEAM_STATUS_LABELS } from '../lib'
import { membersTable, teamsTable } from '../export'
import TeamImportDialog from './TeamImportDialog.vue'
import TeamStatusBadge from './TeamStatusBadge.vue'

/** Teams of an event, for its staff. Managers import teams from CSV or add them one by one. */
const props = defineProps<{ event: EventRecord; canManage: boolean }>()

const { data: teams, loading, error, load } = useLoader(() => listEventTeams(props.event.id))
const categories = useLoader(() => listEventCategories(props.event.id))
// Document count per team (M1-13); the API only returns documents the user may see.
const documents = useLoader(() => listEventTeamDocuments(props.event.id))
const documentCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const doc of documents.data.value ?? [])
    counts.set(doc.team, (counts.get(doc.team) ?? 0) + 1)
  return counts
})
const statusFilter = ref<TeamStatus | ''>('')
const categoryFilter = ref('')
const importOpen = ref(false)

// Active and withdrawn, plus any older status that still occurs (teams registered before M8-A).
const statuses = computed(() => [
  ...new Set([...CURRENT_STATUSES, ...(teams.value ?? []).map((team) => team.status)]),
])

const filtered = computed(() =>
  (teams.value ?? []).filter(
    (t) =>
      (!statusFilter.value || t.status === statusFilter.value) &&
      (!categoryFilter.value || t.category === categoryFilter.value),
  ),
)

// Export (M7-05, M7-06): the teams as filtered, with their members on a second sheet.
const exportTables = () => [
  teamsTable(filtered.value, categories.data.value ?? []),
  membersTable(filtered.value, categories.data.value ?? [], props.event.season),
]

function onImported(count: number) {
  toast.success(t('teams.import.imported', count))
  load()
}

onMounted(() => Promise.all([load(), categories.load(), documents.load()]))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end gap-2">
      <NativeSelect v-model="statusFilter" :aria-label="t('teams.filter.status')">
        <NativeSelectOption value="">{{ t('teams.filter.allStatuses') }}</NativeSelectOption>
        <NativeSelectOption v-for="value in statuses" :key="value" :value="value">
          {{ TEAM_STATUS_LABELS[value] }}
        </NativeSelectOption>
      </NativeSelect>
      <NativeSelect v-model="categoryFilter" :aria-label="t('teams.filter.category')">
        <NativeSelectOption value="">{{ t('teams.filter.allCategories') }}</NativeSelectOption>
        <NativeSelectOption v-for="c in categories.data.value" :key="c.id" :value="c.id">
          {{ c.code }}
        </NativeSelectOption>
      </NativeSelect>
      <ExportButtons
        class="ml-auto"
        :title="t('teams.export.title', { event: event.name })"
        :tables="exportTables"
        :disabled="!filtered.length"
      />
      <template v-if="canManage">
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'team-new', params: { eventId: event.id } }">
            <PlusIcon /> {{ t('teams.add') }}
          </RouterLink>
        </Button>
        <Button @click="importOpen = true"> <UploadIcon /> {{ t('teams.import.button') }} </Button>
      </template>
    </div>

    <ErrorAlert :error="error" />

    <Table data-testid="event-teams">
      <TableHeader>
        <TableRow>
          <TableHead>{{ t('teams.team') }}</TableHead>
          <TableHead>{{ t('teams.category') }}</TableHead>
          <TableHead class="hidden md:table-cell">{{ t('teams.organization') }}</TableHead>
          <TableHead class="hidden lg:table-cell">{{ t('teams.contact') }}</TableHead>
          <TableHead>{{ t('teams.members') }}</TableHead>
          <TableHead class="hidden sm:table-cell">{{ t('teams.documents.title') }}</TableHead>
          <TableHead>{{ t('common.status') }}</TableHead>
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
            team.coach_name || team.coach_email || '–'
          }}</TableCell>
          <TableCell>{{ team.members?.length ?? 0 }}</TableCell>
          <TableCell
            class="hidden sm:table-cell"
            :data-documents="documentCounts.get(team.id) ?? 0"
          >
            <RouterLink
              v-if="documentCounts.get(team.id)"
              :to="{ name: 'team', params: { id: team.id }, hash: '#documents' }"
              class="inline-flex items-center gap-1 hover:underline"
              :aria-label="
                t('teams.documents.countOf', documentCounts.get(team.id) ?? 0, { team: team.name })
              "
            >
              <PaperclipIcon class="size-3.5" aria-hidden="true" />
              {{ documentCounts.get(team.id) }}
            </RouterLink>
            <span v-else class="text-muted-foreground">–</span>
          </TableCell>
          <TableCell><TeamStatusBadge :status="team.status" /></TableCell>
        </TableRow>
        <TableEmpty v-if="!loading && !filtered.length" :colspan="7">{{
          t('teams.empty')
        }}</TableEmpty>
      </TableBody>
    </Table>

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
