<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
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
import type { TeamRecord } from '@/shared/types/records'
import { listOwnScheduledGames, listOwnTeams, updateTeam } from '../api'
import { canCoachEdit } from '../lib'
import TeamStatusBadge from '../components/TeamStatusBadge.vue'

const session = useSessionStore()
const { data: teams, loading, error, load } = useLoader(() => listOwnTeams(session.user!.id))
const schedule = useLoader(() => listOwnScheduledGames(session.user!.id))
const submitRegistration = useSubmit(
  async (team: TeamRecord) => {
    await updateTeam(team.id, { status: 'submitted' })
    await load()
  },
  { success: 'Registration submitted.' },
)

onMounted(() => Promise.all([load(), schedule.load()]))
</script>

<template>
  <PageHeader title="My teams" description="Team registrations you manage as coach.">
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink to="/events">Register a team</RouterLink></Button
      >
    </template>
  </PageHeader>
  <ErrorAlert :error="error ?? submitRegistration.error.value" />
  <Table data-testid="my-teams">
    <TableHeader>
      <TableRow>
        <TableHead>Team</TableHead>
        <TableHead>Event</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Status</TableHead>
        <TableHead class="w-0"><span class="sr-only">Actions</span></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="team in teams" :key="team.id" :data-team="team.name">
        <TableCell class="font-medium">
          <RouterLink :to="{ name: 'team', params: { id: team.id } }" class="hover:underline">
            {{ team.name }}
          </RouterLink>
        </TableCell>
        <TableCell>{{ team.expand?.event?.name }}</TableCell>
        <TableCell>{{ team.expand?.category?.name }}</TableCell>
        <TableCell><TeamStatusBadge :status="team.status" /></TableCell>
        <TableCell class="text-right whitespace-nowrap">
          <Button
            v-if="team.expand?.event && canCoachEdit(team, team.expand.event)"
            size="sm"
            variant="outline"
            :disabled="submitRegistration.pending.value"
            @click="submitRegistration.run(team)"
          >
            {{ team.status === 'rejected' ? 'Resubmit' : 'Submit' }}
          </Button>
        </TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !teams?.length" :colspan="5">
        You have not registered any teams yet.
      </TableEmpty>
    </TableBody>
  </Table>

  <h2 class="mt-8 mb-2 text-lg font-semibold">Schedule</h2>
  <ErrorAlert :error="schedule.error.value" />
  <p v-if="schedule.loading.value" class="text-sm text-muted-foreground">Loading schedule…</p>
  <Table data-testid="my-schedule">
    <TableHeader>
      <TableRow>
        <TableHead>Round</TableHead>
        <TableHead>Table</TableHead>
        <TableHead>Sequence</TableHead>
        <TableHead>Team</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="game in schedule.data.value" :key="game.id">
        <TableCell>{{ game.expand?.round?.name }}</TableCell>
        <TableCell>{{ game.expand?.table?.name ?? '–' }}</TableCell>
        <TableCell>{{ game.sequence }}</TableCell>
        <TableCell class="font-medium">{{ game.expand?.team?.name }}</TableCell>
      </TableRow>
      <TableEmpty v-if="!schedule.loading.value && !schedule.data.value?.length" :colspan="4">
        No games of your teams are scheduled yet.
      </TableEmpty>
    </TableBody>
  </Table>
</template>
