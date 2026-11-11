<script setup lang="ts">
import { t } from '@/i18n'
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
        <DialogTitle>{{ rule ? t('scoring.game.edit') : t('scoring.game.new') }}</DialogTitle>
        <DialogDescription>
          {{ t('scoring.game.description') }}
        </DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-3" @submit.prevent="submit.run()">
        <ErrorAlert :error="submit.error.value" />
        <FormField
          v-slot="{ id }"
          :label="t('common.name')"
          name="name"
          :errors="submit.fieldErrors.value"
        >
          <Input
            :id="id"
            v-model="form.name"
            required
            :placeholder="t('scoring.game.namePlaceholder')"
          />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('rankings.rounds.key')"
          name="key"
          :errors="submit.fieldErrors.value"
          :description="t('scoring.game.keyHint')"
        >
          <Input :id="id" v-model="form.key" required pattern="[A-Za-z][A-Za-z0-9_\-]*" />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('common.description')"
          name="description"
          :errors="submit.fieldErrors.value"
        >
          <Textarea :id="id" v-model="form.description" rows="3" />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">{{
            t('common.cancel')
          }}</Button>
          <Button type="submit" :disabled="submit.pending.value">
            {{ rule ? t('common.save') : t('scoring.game.create') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
