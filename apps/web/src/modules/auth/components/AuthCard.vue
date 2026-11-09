<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mx-auto w-full max-w-sm py-8">
    <Card>
      <CardHeader>
        <CardTitle
          ><h1 class="text-xl">{{ title }}</h1></CardTitle
        >
        <CardDescription v-if="description">{{ description }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <slot />
      </CardContent>
    </Card>
    <div class="mt-4 text-center text-sm text-muted-foreground"><slot name="footer" /></div>
  </div>
</template>
