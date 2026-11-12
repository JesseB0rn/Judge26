<script setup lang="ts">
import { t } from '@/i18n'
import { reactive, watch } from 'vue'
import { DownloadIcon, LibraryIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { EventRecord } from '@/shared/types/records'
import { exportEventTemplate, saveEventAsTemplate } from '../api'
import { downloadTemplate } from '../lib'

/**
 * Save an event as a template (M8-21): download it as a file (managers and admins) or keep it in
 * the template library (admins).
 */
const props = defineProps<{ event: EventRecord }>()
const open = defineModel<boolean>('open', { required: true })
const session = useSessionStore()

const form = reactive({ name: '', description: '' })

const download = useSubmit(async () => {
  const file = await exportEventTemplate(props.event.id)
  downloadTemplate(
    { ...file, name: form.name || file.name, description: form.description },
    form.name || file.name,
  )
})

const save = useSubmit(
  async () => {
    await saveEventAsTemplate(props.event.id, form)
    open.value = false
  },
  { success: () => t('templates.save.saved') },
)

watch(open, (isOpen) => {
  if (!isOpen) return
  download.reset()
  save.reset()
  Object.assign(form, { name: props.event.name, description: '' })
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('templates.save.title') }}</DialogTitle>
        <DialogDescription>{{ t('templates.save.description') }}</DialogDescription>
      </DialogHeader>
      <form id="save-template-form" class="flex flex-col gap-4" @submit.prevent="save.run()">
        <ErrorAlert :error="download.error.value ?? save.error.value" />
        <FieldGroup>
          <FormField
            v-slot="{ id }"
            :label="t('common.name')"
            name="name"
            :errors="save.fieldErrors.value"
          >
            <Input :id="id" v-model="form.name" required maxlength="200" />
          </FormField>
          <FormField v-slot="{ id }" :label="t('common.description')" name="description">
            <Textarea :id="id" v-model="form.description" rows="2" maxlength="2000" />
          </FormField>
        </FieldGroup>
        <Alert v-if="!session.isAdmin">
          <AlertDescription>{{ t('templates.save.managerHint') }}</AlertDescription>
        </Alert>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button
          :variant="session.isAdmin ? 'outline' : 'default'"
          :disabled="download.pending.value"
          data-testid="download-template"
          @click="download.run()"
        >
          <DownloadIcon /> {{ t('templates.save.download') }}
        </Button>
        <Button
          v-if="session.isAdmin"
          type="submit"
          form="save-template-form"
          :disabled="save.pending.value || !form.name.trim()"
        >
          <LibraryIcon /> {{ t('templates.save.toLibrary') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
