<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { LogOutIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useSessionStore } from '@/shared/auth/session'
import { config } from '@/shared/config/env'

const session = useSessionStore()
const router = useRouter()

async function logout() {
  session.logout()
  await router.push({ name: 'login' })
}

/**
 * Main navigation, ordered by what is urgent on competition day: the work queues of the
 * signed-in role first, then browsing, then the admin setup pages, set apart so they are not
 * hit by accident.
 */
const work = computed(() => {
  if (!session.isAuthenticated || !session.isVerified) return []
  return [
    session.isJudge && { to: '/judging', label: 'Judging' },
    session.canReview && { to: '/review', label: 'Review' },
  ].filter((l): l is { to: string; label: string } => !!l)
})
const browse = computed(() => {
  const signedIn = session.isAuthenticated && session.isVerified
  return [
    ...(signedIn
      ? [
          { to: '/events', label: 'Events' },
          { to: '/teams', label: 'My teams' },
        ]
      : []),
    { to: '/live', label: 'Live results' },
  ]
})
const admin = computed(() =>
  session.isAuthenticated && session.isVerified && session.isAdmin
    ? [
        { to: '/admin/categories', label: 'Categories' },
        { to: '/admin/users', label: 'Users' },
        { to: '/admin/emails', label: 'Emails' },
        { to: '/admin/audit', label: 'Audit log' },
        { to: '/admin/monitoring', label: 'System health' },
      ]
    : [],
)

const linkClass =
  'shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground'
const workClass = 'font-semibold text-foreground'
const activeClass = '!bg-foreground !text-background font-medium'
</script>

<template>
  <div class="flex min-h-svh flex-col">
    <header class="border-b print:hidden">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 px-4 sm:flex-nowrap">
        <RouterLink to="/" class="flex h-14 items-center font-semibold">{{
          config.appName
        }}</RouterLink>
        <!-- On phones the navigation gets its own scrollable row instead of overflowing. -->
        <nav
          class="order-last -mx-4 flex w-[calc(100%+2rem)] min-w-0 items-center gap-1 overflow-x-auto border-t px-4 py-2 sm:order-none sm:mx-0 sm:w-auto sm:border-t-0 sm:px-0"
          aria-label="Main"
        >
          <RouterLink
            v-for="link in work"
            :key="link.to"
            :to="link.to"
            :class="[linkClass, workClass]"
            :active-class="activeClass"
            >{{ link.label }}</RouterLink
          >
          <span v-if="work.length" class="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <RouterLink
            v-for="link in browse"
            :key="link.to"
            :to="link.to"
            :class="linkClass"
            :active-class="activeClass"
            >{{ link.label }}</RouterLink
          >
          <template v-if="admin.length">
            <span class="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <span
              class="shrink-0 px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >Admin</span
            >
            <RouterLink
              v-for="link in admin"
              :key="link.to"
              :to="link.to"
              :class="linkClass"
              :active-class="activeClass"
              >{{ link.label }}</RouterLink
            >
          </template>
        </nav>
        <div class="ml-auto flex h-14 items-center gap-2">
          <span
            v-if="config.environment !== 'production'"
            class="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
          >
            {{ config.environment }}
          </span>
          <template v-if="session.isAuthenticated">
            <span class="hidden text-sm text-muted-foreground lg:inline" data-testid="current-user">
              {{ session.user?.name || session.user?.email }}
            </span>
            <Button variant="ghost" size="sm" @click="logout"><LogOutIcon /> Sign out</Button>
          </template>
          <template v-else>
            <Button as-child variant="ghost" size="sm"
              ><RouterLink to="/login">Sign in</RouterLink></Button
            >
            <Button as-child size="sm"><RouterLink to="/register">Register</RouterLink></Button>
          </template>
        </div>
      </div>
    </header>
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <slot />
    </main>
    <Toaster rich-colors />
  </div>
</template>
