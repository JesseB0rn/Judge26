<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { CalendarIcon, LibraryIcon, UsersIcon, UsersRoundIcon } from '@lucide/vue'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useSessionStore } from '@/shared/auth/session'
import { ROLE_LABELS } from '@/shared/types/records'

const session = useSessionStore()
</script>

<template>
  <PageHeader :title="`Welcome${session.user?.name ? ', ' + session.user.name : ''}`" />

  <section v-if="session.roles.length" class="mb-6">
    <h2 class="mb-2 text-sm font-medium text-muted-foreground">Your roles</h2>
    <ul class="flex flex-wrap gap-2" data-testid="my-roles">
      <li v-for="r in session.roles" :key="r.id">
        <RouterLink
          v-if="r.event"
          :to="{ name: 'event', params: { id: r.event } }"
          class="rounded-md border px-3 py-1 text-sm hover:bg-muted"
        >
          {{ ROLE_LABELS[r.role] }} · {{ r.expand?.event?.name ?? r.event }}
        </RouterLink>
        <span v-else class="rounded-md border px-3 py-1 text-sm">{{ ROLE_LABELS[r.role] }}</span>
      </li>
    </ul>
  </section>

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <RouterLink to="/events">
      <Card class="h-full hover:bg-muted/50">
        <CardHeader>
          <CalendarIcon class="mb-2 size-5" />
          <CardTitle>Events</CardTitle>
          <CardDescription>Browse competitions and register teams.</CardDescription>
        </CardHeader>
      </Card>
    </RouterLink>
    <RouterLink to="/teams">
      <Card class="h-full hover:bg-muted/50">
        <CardHeader>
          <UsersRoundIcon class="mb-2 size-5" />
          <CardTitle>My teams</CardTitle>
          <CardDescription>Your team registrations and their status.</CardDescription>
        </CardHeader>
      </Card>
    </RouterLink>
    <template v-if="session.isAdmin">
      <RouterLink to="/admin/categories">
        <Card class="h-full hover:bg-muted/50">
          <CardHeader>
            <LibraryIcon class="mb-2 size-5" />
            <CardTitle>Category library</CardTitle>
            <CardDescription>Reusable category templates.</CardDescription>
          </CardHeader>
        </Card>
      </RouterLink>
      <RouterLink to="/admin/users">
        <Card class="h-full hover:bg-muted/50">
          <CardHeader>
            <UsersIcon class="mb-2 size-5" />
            <CardTitle>Users</CardTitle>
            <CardDescription>Accounts and administrator roles.</CardDescription>
          </CardHeader>
        </Card>
      </RouterLink>
    </template>
  </div>
</template>
