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
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { CategoryRecord } from '@/shared/types/records'
import { copyCategory } from '../api'

/**
 * Copies a category (M1-09). Either the source is fixed and the user picks a
 * target from `targets`, or the target is fixed and the user picks a source.
 */
const props = defineProps<{
  title: string
  source?: CategoryRecord
  sources?: CategoryRecord[]
  /** Target event id ('' = template library). */
  target?: string
  targets?: { id: string; label: string }[]
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ copied: [category: CategoryRecord] }>()

const sourceId = ref('')
const targetId = ref('')
const code = ref('')

const selectedSource = computed(
  () => props.source ?? props.sources?.find((s) => s.id === sourceId.value),
)

const { run, pending, error, fieldErrors, reset } = useSubmit(async () => {
  if (!selectedSource.value) return
  const copied = await copyCategory(selectedSource.value.id, {
    event: props.target ?? targetId.value,
    code: code.value || undefined,
  })
  emit('copied', copied)
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  sourceId.value = props.sources?.[0]?.id ?? ''
  targetId.value = props.targets?.[0]?.id ?? ''
  code.value = ''
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ t('categories.copy.description') }}</DialogDescription>
      </DialogHeader>
      <form id="copy-category-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FieldGroup>
          <FormField v-if="!source" v-slot="{ id }" :label="t('categories.template')" name="source">
            <NativeSelect :id="id" v-model="sourceId" class="w-full" required>
              <NativeSelectOption v-for="s in sources" :key="s.id" :value="s.id">
                {{ s.code }} – {{ s.name }}
              </NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField
            v-if="target === undefined"
            v-slot="{ id }"
            :label="t('categories.copy.target')"
            name="event"
            :errors="fieldErrors"
          >
            <NativeSelect :id="id" v-model="targetId" class="w-full" required>
              <NativeSelectOption v-for="option in targets" :key="option.id" :value="option.id">{{
                option.label
              }}</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField
            v-slot="{ id }"
            :label="t('categories.code')"
            name="code"
            :errors="fieldErrors"
            :description="
              selectedSource
                ? t('categories.copy.keepCode', { code: selectedSource.code })
                : t('categories.copy.keepOriginalCode')
            "
          >
            <Input :id="id" v-model="code" pattern="[A-Za-z0-9_\-]+" />
          </FormField>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="copy-category-form" :disabled="pending || !selectedSource">{{
          t('categories.copy.submit')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
