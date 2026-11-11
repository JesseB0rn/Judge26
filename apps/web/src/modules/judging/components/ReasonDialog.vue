<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import type { AppError } from '@/shared/api/errors'

/** Asks for the reason of a rejection or correction (M5-11, M5-12). */
defineProps<{
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  error?: AppError | null
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [reason: string] }>()
const reason = ref('')

watch(open, (isOpen) => {
  if (isOpen) reason.value = ''
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <form
        id="reason-form"
        class="flex flex-col gap-2"
        @submit.prevent="reason.trim() && emit('confirm', reason.trim())"
      >
        <ErrorAlert :error="error" />
        <label for="reason" class="text-sm font-medium">{{ t('teams.review.reason') }}</label>
        <Textarea id="reason" v-model="reason" rows="3" required class="text-base" />
      </form>
      <DialogFooter class="gap-2">
        <Button variant="outline" size="touch" @click="open = false">{{
          t('common.cancel')
        }}</Button>
        <Button
          type="submit"
          form="reason-form"
          size="touch"
          :variant="destructive ? 'destructive' : 'default'"
          :disabled="busy || !reason.trim()"
          >{{ confirmLabel }}</Button
        >
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
