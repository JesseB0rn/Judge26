<script setup lang="ts">
import { reactive, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { GameRuleRecord } from '@/shared/types/records'
import type { GameRuleInput } from '../api'

/** Creates or renames a game rule (one game of a category with its own ruleset). */
const props = defineProps<{
  /** The game rule to edit; omitted to create one. */
  rule?: GameRuleRecord
  save: (data: GameRuleInput) => Promise<unknown>
}>()
const open = defineModel<boolean>('open', { required: true })

const form = reactive<GameRuleInput>({ key: '', name: '', description: '' })
watch(open, (isOpen) => {
  if (!isOpen) return
  form.key = props.rule?.key ?? ''
  form.name = props.rule?.name ?? ''
  form.description = props.rule?.description ?? ''
  submit.reset()
})

const submit = useSubmit(async () => {
  await props.save({ ...form })
  open.value = false
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ rule ? 'Edit game' : 'New game' }}</DialogTitle>
        <DialogDescription>
          Each game has its own score sheet and versions. Rounds choose the game they play.
        </DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-3" @submit.prevent="submit.run()">
        <ErrorAlert :error="submit.error.value" />
        <FormField v-slot="{ id }" label="Name" name="name" :errors="submit.fieldErrors.value">
          <Input :id="id" v-model="form.name" required placeholder="e.g. Obstacle course" />
        </FormField>
        <FormField
          v-slot="{ id }"
          label="Key"
          name="key"
          :errors="submit.fieldErrors.value"
          description="Short identifier, unique in the category."
        >
          <Input :id="id" v-model="form.key" required pattern="[A-Za-z][A-Za-z0-9_\-]*" />
        </FormField>
        <FormField
          v-slot="{ id }"
          label="Description"
          name="description"
          :errors="submit.fieldErrors.value"
        >
          <Textarea :id="id" v-model="form.description" rows="3" />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="submit.pending.value">
            {{ rule ? 'Save' : 'Create game' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
