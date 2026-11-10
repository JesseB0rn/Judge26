<script setup lang="ts">
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

const linkClass = 'text-sm text-muted-foreground hover:text-foreground'
const activeClass = '!text-foreground font-medium'
</script>

<template>
  <div class="flex min-h-svh flex-col">
    <header class="border-b">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <RouterLink to="/" class="font-semibold">{{ config.appName }}</RouterLink>
        <nav
          v-if="session.isAuthenticated && session.isVerified"
          class="flex items-center gap-4"
          aria-label="Main"
        >
          <RouterLink to="/events" :class="linkClass" :active-class="activeClass"
            >Events</RouterLink
          >
          <RouterLink
            v-if="session.isJudge"
            to="/judging"
            :class="linkClass"
            :active-class="activeClass"
            >Judging</RouterLink
          >
          <RouterLink to="/teams" :class="linkClass" :active-class="activeClass"
            >My teams</RouterLink
          >
          <template v-if="session.isAdmin">
            <RouterLink to="/admin/categories" :class="linkClass" :active-class="activeClass">
              Categories
            </RouterLink>
            <RouterLink to="/admin/users" :class="linkClass" :active-class="activeClass"
              >Users</RouterLink
            >
          </template>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <span
            v-if="config.environment !== 'production'"
            class="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
          >
            {{ config.environment }}
          </span>
          <template v-if="session.isAuthenticated">
            <span class="hidden text-sm text-muted-foreground sm:inline" data-testid="current-user">
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
