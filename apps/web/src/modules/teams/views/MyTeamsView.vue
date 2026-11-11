<script setup lang="ts">
import { t } from '@/i18n'
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
import { formatDay } from '@/shared/format'
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
  { success: () => t('teams.form.submitted') },
)

onMounted(() => Promise.all([load(), schedule.load()]))
</script>

<template>
  <PageHeader :title="t('shell.nav.myTeams')" :description="t('teams.mine.description')">
    <template #actions>
      <Button as-child variant="outline"
        ><RouterLink to="/events">{{ t('events.detail.registerTeam') }}</RouterLink></Button
      >
    </template>
  </PageHeader>
  <ErrorAlert :error="error ?? submitRegistration.error.value" />
  <Table data-testid="my-teams">
    <TableHeader>
      <TableRow>
        <TableHead>{{ t('teams.team') }}</TableHead>
        <TableHead>{{ t('events.event') }}</TableHead>
        <TableHead>{{ t('teams.category') }}</TableHead>
        <TableHead>{{ t('common.status') }}</TableHead>
        <TableHead class="w-0"
          ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
        >
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
            {{ team.status === 'rejected' ? t('teams.mine.resubmit') : t('teams.mine.submit') }}
          </Button>
        </TableCell>
      </TableRow>
      <TableEmpty v-if="!loading && !teams?.length" :colspan="5">
        {{ t('teams.mine.empty') }}
      </TableEmpty>
    </TableBody>
  </Table>

  <h2 class="mt-8 mb-2 text-lg font-semibold">{{ t('events.tabs.schedule') }}</h2>
  <ErrorAlert :error="schedule.error.value" />
  <p v-if="schedule.loading.value" class="text-sm text-muted-foreground">
    {{ t('teams.mine.loadingSchedule') }}
  </p>
  <Table data-testid="my-schedule">
    <TableHeader>
      <TableRow>
        <TableHead>{{ t('teams.mine.round') }}</TableHead>
        <TableHead>{{ t('teams.mine.when') }}</TableHead>
        <TableHead>{{ t('teams.mine.table') }}</TableHead>
        <TableHead>{{ t('teams.mine.sequence') }}</TableHead>
        <TableHead>{{ t('teams.team') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="game in schedule.data.value" :key="game.id">
        <TableCell>{{ game.expand?.round?.name }}</TableCell>
        <TableCell class="text-sm" data-testid="my-schedule-when">
          <template v-if="game.expand?.round?.day">{{
            game.expand.round.day.label || formatDay(game.expand.round.day.date)
          }}</template>
          <template v-if="game.expand?.round?.starts_at">
            · {{ t('teams.mine.from', { time: game.expand.round.starts_at }) }}</template
          >
          <template v-if="!game.expand?.round?.day && !game.expand?.round?.starts_at">–</template>
        </TableCell>
        <TableCell>{{ game.expand?.table?.name ?? '–' }}</TableCell>
        <TableCell>{{ game.sequence }}</TableCell>
        <TableCell class="font-medium">{{ game.expand?.team?.name }}</TableCell>
      </TableRow>
      <TableEmpty v-if="!schedule.loading.value && !schedule.data.value?.length" :colspan="5">
        {{ t('teams.mine.noGames') }}
      </TableEmpty>
    </TableBody>
  </Table>
</template>
