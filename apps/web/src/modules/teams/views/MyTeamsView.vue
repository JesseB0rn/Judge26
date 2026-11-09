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
import { listOwnTeams } from '../api'
import TeamStatusBadge from '../components/TeamStatusBadge.vue'

const session = useSessionStore()
const { data: teams, loading, error, load } = useLoader(() => listOwnTeams(session.user!.id))

onMounted(load)
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
</template>
