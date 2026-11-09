<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { config } from '@/shared/config/env'
</script>

<template>
  <div class="flex min-h-svh flex-col">
    <header class="border-b">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <RouterLink to="/" class="font-semibold">{{ config.appName }}</RouterLink>
        <span
          v-if="config.environment !== 'production'"
          class="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
        >
          {{ config.environment }}
        </span>
      </div>
    </header>
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <slot />
    </main>
    <Toaster rich-colors />
  </div>
</template>
