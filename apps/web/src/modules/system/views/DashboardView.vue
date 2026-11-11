<script setup lang="ts">
import { t } from '@/i18n'
import { RouterLink } from 'vue-router'
import {
  CalendarIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  LibraryIcon,
  UsersIcon,
  UsersRoundIcon,
} from '@lucide/vue'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useSessionStore } from '@/shared/auth/session'
import { ROLE_LABELS, type RoleAssignmentRecord } from '@/shared/types/records'

const session = useSessionStore()

/** Each role chip opens the page where that role works, not just the event overview. */
function roleLink(r: RoleAssignmentRecord) {
  if (r.role === 'judge') return { name: 'judging' }
  if (r.role === 'head_judge') return { name: 'review', query: { event: r.event } }
  return { name: 'event', params: { id: r.event } }
}
</script>

<template>
  <PageHeader
    :title="
      session.user?.name
        ? t('system.dashboard.welcomeName', { name: session.user.name })
        : t('system.dashboard.welcome')
    "
  />

  <section v-if="session.roles.length" class="mb-6">
    <h2 class="mb-2 text-sm font-medium text-muted-foreground">
      {{ t('system.dashboard.roles') }}
    </h2>
    <ul class="flex flex-wrap gap-2" data-testid="my-roles">
      <li v-for="r in session.roles" :key="r.id">
        <RouterLink
          v-if="r.event"
          :to="roleLink(r)"
          class="rounded-md border px-3 py-1 text-sm hover:bg-muted"
        >
          {{ ROLE_LABELS[r.role] }} · {{ r.expand?.event?.name ?? r.event }}
        </RouterLink>
        <span v-else class="rounded-md border px-3 py-1 text-sm">{{ ROLE_LABELS[r.role] }}</span>
      </li>
    </ul>
  </section>

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <!-- Judges reach their next game in two taps after signing in (M5 usability). -->
    <RouterLink
      v-if="session.isJudge"
      to="/judging"
      :class="session.canReview ? 'lg:col-span-2' : 'sm:col-span-2 lg:col-span-4'"
    >
      <Card
        class="h-full border-2 border-foreground/80 hover:bg-muted/50"
        data-testid="judging-card"
      >
        <CardHeader>
          <ClipboardCheckIcon class="mb-2 size-6" />
          <CardTitle class="text-xl">{{ t('shell.nav.judging') }}</CardTitle>
          <CardDescription>{{ t('system.dashboard.judging') }}</CardDescription>
        </CardHeader>
      </Card>
    </RouterLink>
    <RouterLink
      v-if="session.canReview"
      to="/review"
      :class="session.isJudge ? 'lg:col-span-2' : 'sm:col-span-2 lg:col-span-4'"
    >
      <Card
        class="h-full border-2 border-foreground/80 hover:bg-muted/50"
        data-testid="review-card"
      >
        <CardHeader>
          <ClipboardListIcon class="mb-2 size-6" />
          <CardTitle class="text-xl">{{ t('shell.nav.review') }}</CardTitle>
          <CardDescription>{{ t('system.dashboard.review') }}</CardDescription>
        </CardHeader>
      </Card>
    </RouterLink>
    <RouterLink to="/events">
      <Card class="h-full hover:bg-muted/50">
        <CardHeader>
          <CalendarIcon class="mb-2 size-5" />
          <CardTitle>{{ t('shell.nav.events') }}</CardTitle>
          <CardDescription>{{ t('system.dashboard.events') }}</CardDescription>
        </CardHeader>
      </Card>
    </RouterLink>
    <RouterLink to="/teams">
      <Card class="h-full hover:bg-muted/50">
        <CardHeader>
          <UsersRoundIcon class="mb-2 size-5" />
          <CardTitle>{{ t('shell.nav.myTeams') }}</CardTitle>
          <CardDescription>{{ t('system.dashboard.teams') }}</CardDescription>
        </CardHeader>
      </Card>
    </RouterLink>
    <template v-if="session.isAdmin">
      <RouterLink to="/admin/categories">
        <Card class="h-full hover:bg-muted/50">
          <CardHeader>
            <LibraryIcon class="mb-2 size-5" />
            <CardTitle>{{ t('system.dashboard.library') }}</CardTitle>
            <CardDescription>{{ t('system.dashboard.libraryDescription') }}</CardDescription>
          </CardHeader>
        </Card>
      </RouterLink>
      <RouterLink to="/admin/users">
        <Card class="h-full hover:bg-muted/50">
          <CardHeader>
            <UsersIcon class="mb-2 size-5" />
            <CardTitle>{{ t('shell.nav.users') }}</CardTitle>
            <CardDescription>{{ t('system.dashboard.users') }}</CardDescription>
          </CardHeader>
        </Card>
      </RouterLink>
    </template>
  </div>
</template>
