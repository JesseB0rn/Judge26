<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSessionStore } from '@/shared/auth/session'
import type { EventRecord } from '@/shared/types/records'
import TemplateEventForm from '@/modules/templates/components/TemplateEventForm.vue'
import EventForm from './EventForm.vue'

/**
 * M11-12: one dialog for a new event. Admins choose at the top between an empty event and one
 * from a library template; `templateId` (the library's New event) opens it on that template.
 */
const props = defineProps<{ templateId?: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [event: EventRecord] }>()
const session = useSessionStore()

const mode = ref<'empty' | 'template'>('empty')
const canUseTemplates = computed(() => session.isAdmin)
const emptyForm = ref<InstanceType<typeof EventForm>>()
const templateForm = ref<InstanceType<typeof TemplateEventForm>>()

watch(open, (isOpen) => {
  if (isOpen) mode.value = props.templateId && canUseTemplates.value ? 'template' : 'empty'
})

const pending = computed(() =>
  mode.value === 'empty' ? !!emptyForm.value?.pending : !!templateForm.value?.pending,
)
const disabled = computed(
  () => pending.value || (mode.value === 'template' && !templateForm.value?.ready),
)

function onCreated(event: EventRecord) {
  open.value = false
  emit('created', event)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="new-event-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('events.form.newTitle') }}</DialogTitle>
        <DialogDescription>{{ t('events.form.description') }}</DialogDescription>
      </DialogHeader>
      <fieldset
        v-if="canUseTemplates"
        class="grid gap-2 sm:grid-cols-2"
        data-testid="new-event-mode"
      >
        <legend class="sr-only">{{ t('events.newEvent.startFrom') }}</legend>
        <label
          v-for="option in ['empty', 'template'] as const"
          :key="option"
          class="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
        >
          <input
            v-model="mode"
            type="radio"
            name="new-event-mode"
            :value="option"
            class="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span class="font-medium">{{ t(`events.newEvent.${option}`) }}</span>
            <span class="block text-xs text-muted-foreground">{{
              t(`events.newEvent.${option}Hint`)
            }}</span>
          </span>
        </label>
      </fieldset>
      <EventForm
        v-if="mode === 'empty'"
        ref="emptyForm"
        form-id="new-event-form"
        @saved="onCreated"
      />
      <TemplateEventForm
        v-else
        ref="templateForm"
        form-id="new-event-form"
        :template-id="templateId"
        @created="onCreated"
      />
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button
          type="submit"
          form="new-event-form"
          :disabled="disabled"
          data-testid="create-event"
          >{{ mode === 'empty' ? t('common.save') : t('templates.create.submit') }}</Button
        >
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
