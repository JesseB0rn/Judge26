<script setup lang="ts">
import BackendStatus from '../components/BackendStatus.vue'
import { config } from '@/shared/config/env'
</script>

<template>
  <section class="mx-auto flex max-w-2xl flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">{{ config.appName }}</h1>
      <p class="text-muted-foreground">World Robot Olympiad competition management.</p>
    </div>
    <BackendStatus />
  </section>
</template>
