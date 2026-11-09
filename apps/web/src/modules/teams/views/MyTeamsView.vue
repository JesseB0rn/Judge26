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
import { useLoader } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import { listOwnScheduledGames, listOwnTeams } from '../api'
import TeamStatusBadge from '../components/TeamStatusBadge.vue'

const session = useSessionStore()
const { data: teams, loading, error, load } = useLoader(() => listOwnTeams(session.user!.id))
const schedule = useLoader(() => listOwnScheduledGames(session.user!.id))

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
  <ErrorAlert :error="error" />
  <Table data-testid="my-teams">
    <TableHeader>
      <TableRow>
        <TableHead>Team</TableHead>
        <TableHead>Event</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="team in teams" :key="team.id">
        <TableCell class="font-medium">
          <RouterLink :to="{ name: 'team', params: { id: team.id } }" class="hover:underline">
            {{ team.name }}
          </RouterLink>
        </TableCell>
        <TableCell>{{ team.expand?.event?.name }}</TableCell>
        <TableCell>{{ team.expand?.category?.name }}</TableCell>
        <TableCell><TeamStatusBadge :status="team.status" /></TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !teams?.length" :colspan="4">
        You have not registered any teams yet.
      </TableEmpty>
    </TableBody>
  </Table>

  <h2 class="mt-8 mb-2 text-lg font-semibold">Schedule</h2>
  <ErrorAlert :error="schedule.error.value" />
  <Table data-testid="my-schedule">
    <TableHeader>
      <TableRow>
        <TableHead>Start</TableHead>
        <TableHead>Team</TableHead>
        <TableHead>Round</TableHead>
        <TableHead>Table</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="game in schedule.data.value" :key="game.id">
        <TableCell>{{ formatDateTime(game.starts_at) }}</TableCell>
        <TableCell class="font-medium">{{ game.expand?.team?.name }}</TableCell>
        <TableCell>{{ game.expand?.round?.name }}</TableCell>
        <TableCell>{{ game.expand?.table?.name ?? '–' }}</TableCell>
      </TableRow>
      <TableEmpty v-if="!schedule.loading.value && !schedule.data.value?.length" :colspan="4">
        No games of your teams are scheduled yet.
      </TableEmpty>
    </TableBody>
  </Table>
</template>
