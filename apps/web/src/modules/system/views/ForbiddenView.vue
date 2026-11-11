<script setup lang="ts">
import { t } from '@/i18n'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
</script>

<template>
  <section class="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
    <h1 class="text-2xl font-semibold">{{ t('system.forbidden.title') }}</h1>
    <p class="text-muted-foreground">{{ t('system.forbidden.text') }}</p>
    <Button as-child>
      <RouterLink to="/">{{ t('system.backToStart') }}</RouterLink>
    </Button>
  </section>
</template>
