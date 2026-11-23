<script setup lang="ts">
/** `sub`: a section heading below the event frame (M11-15), where the event name is the h1. */
defineProps<{ title: string; description?: string; sub?: boolean }>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h2 v-if="sub" class="text-xl font-semibold tracking-tight">{{ title }}</h2>
      <h1 v-else class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="text-muted-foreground">{{ description }}</p>
    </div>
    <div class="flex flex-wrap gap-2"><slot name="actions" /></div>
  </div>
</template>
