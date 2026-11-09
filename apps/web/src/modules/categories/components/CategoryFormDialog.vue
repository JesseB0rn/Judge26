<script setup lang="ts">
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
import type { CategoryRecord } from '@/shared/types/records'
import { createCategory, updateCategory, type CategoryInput } from '../api'

/** `eventId` is '' for templates. */
const props = defineProps<{ category?: CategoryRecord; eventId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [category: CategoryRecord] }>()

const empty = (): CategoryInput => ({
  name: '',
  code: '',
  description: '',
  min_age: 0,
  max_age: 0,
  min_team_size: 2,
  max_team_size: 3,
  max_teams: 0,
})
const form = reactive<CategoryInput>(empty())

const { run, pending, error, fieldErrors, reset } = useSubmit(async () => {
  const data = { ...form }
  const saved = props.category
    ? await updateCategory(props.category.id, data)
    : await createCategory(props.eventId, data)
  emit('saved', saved)
  open.value = false
})

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  const c = props.category
  Object.assign(
    form,
    c
      ? {
          name: c.name,
          code: c.code,
          description: c.description,
          min_age: c.min_age,
          max_age: c.max_age,
          min_team_size: c.min_team_size,
          max_team_size: c.max_team_size,
          max_teams: c.max_teams,
        }
      : empty(),
  )
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ category ? 'Edit category' : eventId ? 'New category' : 'New template' }}
        </DialogTitle>
      </DialogHeader>
      <form id="category-form" class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FieldGroup>
          <div class="grid grid-cols-[2fr_1fr] gap-4">
            <FormField v-slot="{ id }" label="Name" name="name" :errors="fieldErrors">
              <Input :id="id" v-model="form.name" required />
            </FormField>
            <FormField v-slot="{ id }" label="Code" name="code" :errors="fieldErrors">
              <Input :id="id" v-model="form.code" required pattern="[A-Za-z0-9_\-]+" />
            </FormField>
          </div>
          <FormField v-slot="{ id }" label="Description" name="description" :errors="fieldErrors">
            <Textarea :id="id" v-model="form.description" rows="2" />
          </FormField>
          <div class="grid grid-cols-2 gap-4">
            <FormField
              v-slot="{ id }"
              label="Min. team size"
              name="min_team_size"
              :errors="fieldErrors"
            >
              <Input :id="id" v-model.number="form.min_team_size" type="number" min="1" max="20" />
            </FormField>
            <FormField
              v-slot="{ id }"
              label="Max. team size"
              name="max_team_size"
              :errors="fieldErrors"
            >
              <Input :id="id" v-model.number="form.max_team_size" type="number" min="1" max="20" />
            </FormField>
            <FormField
              v-slot="{ id }"
              label="Min. age"
              name="min_age"
              :errors="fieldErrors"
              description="0 = no limit. Age = season − birth year."
            >
              <Input :id="id" v-model.number="form.min_age" type="number" min="0" max="100" />
            </FormField>
            <FormField
              v-slot="{ id }"
              label="Max. age"
              name="max_age"
              :errors="fieldErrors"
              description="0 = no limit."
            >
              <Input :id="id" v-model.number="form.max_age" type="number" min="0" max="100" />
            </FormField>
          </div>
          <FormField
            v-slot="{ id }"
            label="Max. approved teams"
            name="max_teams"
            :errors="fieldErrors"
            description="0 = unlimited."
          >
            <Input :id="id" v-model.number="form.max_teams" type="number" min="0" />
          </FormField>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button type="submit" form="category-form" :disabled="pending">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
