<script setup lang="ts">
import { t } from '@/i18n'
import { reactive, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { EventTemplateRecord } from '@/shared/types/records'
import { renameEventTemplate } from '../api'

/** Rename a library template or change its description (M8-24). */
const props = defineProps<{ template?: EventTemplateRecord }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()
const form = reactive({ name: '', description: '' })

const { run, pending, error, fieldErrors, reset } = useSubmit(
  async () => {
    await renameEventTemplate(props.template!.id, form)
    open.value = false
    emit('saved')
  },
  { success: () => t('templates.library.saved') },
)

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  Object.assign(form, {
    name: props.template?.name ?? '',
    description: props.template?.description ?? '',
  })
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('templates.library.editTitle') }}</DialogTitle>
      </DialogHeader>
      <form id="edit-template-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FieldGroup>
          <FormField v-slot="{ id }" :label="t('common.name')" name="name" :errors="fieldErrors">
            <Input :id="id" v-model="form.name" required maxlength="200" />
          </FormField>
          <FormField
            v-slot="{ id }"
            :label="t('common.description')"
            name="description"
            :errors="fieldErrors"
          >
            <Textarea :id="id" v-model="form.description" rows="3" maxlength="2000" />
          </FormField>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="edit-template-form" :disabled="pending">{{
          t('common.save')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
