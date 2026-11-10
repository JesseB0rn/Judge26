<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/shared/components/AppShell.vue'

const route = useRoute()
</script>

<template>
  <!-- TV mode has no navigation or administration controls (M6-T07). -->
  <RouterView v-if="route.meta.layout === 'bare'" />
  <AppShell v-else>
    <RouterView />
  </AppShell>
</template>
