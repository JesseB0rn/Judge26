<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="text-muted-foreground">{{ description }}</p>
    </div>
    <div class="flex flex-wrap gap-2"><slot name="actions" /></div>
  </div>
</template>
