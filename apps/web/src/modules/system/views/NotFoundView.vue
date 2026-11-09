<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
</script>

<template>
  <section class="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
    <h1 class="text-2xl font-semibold">Page not found</h1>
    <p class="text-muted-foreground">The page you are looking for does not exist.</p>
    <Button as-child>
      <RouterLink to="/">Back to start</RouterLink>
    </Button>
  </section>
</template>
