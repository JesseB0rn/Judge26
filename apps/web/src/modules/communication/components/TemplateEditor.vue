<script setup lang="ts">
import { isLocale, t, type Locale } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { SaveIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import type { MailTemplateRecord } from '@/shared/types/records'
import { updateTemplate } from '../api'
import {
  ACCOUNT_TEMPLATES,
  previewDocument,
  renderTemplate,
  sampleValues,
  unknownVariables,
} from '../lib'

/** Edits one notification's subject and body with a live preview (M7-02). */
const props = defineProps<{ template: MailTemplateRecord; variables: string[] }>()
const emit = defineEmits<{ saved: [MailTemplateRecord] }>()

const subject = ref('')
const body = ref('')
const enabled = ref(true)
const bodyInput = ref<{ $el: HTMLTextAreaElement } | null>(null)

function reset() {
  subject.value = props.template.subject
  body.value = props.template.body
  enabled.value = props.template.enabled
}
watch(() => props.template, reset, { immediate: true })

const dirty = computed(
  () =>
    subject.value !== props.template.subject ||
    body.value !== props.template.body ||
    enabled.value !== props.template.enabled,
)
const unknown = computed(() => unknownVariables(`${subject.value} ${body.value}`, props.variables))
const language = computed<Locale>(() =>
  isLocale(props.template.language) ? props.template.language : 'en',
)
const samples = computed(() => sampleValues(language.value))
const previewSubject = computed(() => renderTemplate(subject.value, samples.value, false))
const preview = computed(() => previewDocument(renderTemplate(body.value, samples.value, true)))
const isAccountEmail = computed(() => ACCOUNT_TEMPLATES.includes(props.template.key))

const save = useSubmit(
  async () => {
    const saved = await updateTemplate(props.template.id, {
      subject: subject.value,
      body: body.value,
      enabled: enabled.value,
    })
    emit('saved', saved)
  },
  { success: () => t('communication.editor.saved') },
)

const token = (name: string) => `{{${name}}}`

/** Inserts a placeholder at the cursor of the body. */
function insert(name: string) {
  const el = bodyInput.value?.$el
  const text = token(name)
  if (!el || typeof el.selectionStart !== 'number') {
    body.value += text
    return
  }
  const start = el.selectionStart
  body.value = body.value.slice(0, start) + text + body.value.slice(el.selectionEnd)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(start + text.length, start + text.length)
  })
}
</script>

<template>
  <form
    class="grid gap-4 lg:grid-cols-2"
    data-testid="template-editor"
    @submit.prevent="save.run()"
  >
    <div class="flex flex-col gap-4">
      <label v-if="!isAccountEmail" class="inline-flex min-h-10 items-center gap-2 text-sm">
        <input v-model="enabled" type="checkbox" class="size-5 accent-foreground" name="enabled" />
        {{ t('communication.editor.enabled') }}
      </label>
      <p v-else class="text-sm text-muted-foreground">{{ t('communication.editor.alwaysSent') }}</p>
      <FormField
        v-slot="{ id }"
        :label="t('communication.subject')"
        name="subject"
        :errors="save.fieldErrors.value"
      >
        <Input :id="id" v-model="subject" name="subject" required maxlength="300" />
      </FormField>
      <FormField
        v-slot="{ id }"
        :label="t('communication.editor.body')"
        name="body"
        :errors="save.fieldErrors.value"
        :description="t('communication.editor.bodyHint', { example: '{{name}}' })"
      >
        <Textarea
          :id="id"
          ref="bodyInput"
          v-model="body"
          name="body"
          required
          rows="14"
          class="font-mono text-xs"
        />
      </FormField>
      <div class="flex flex-wrap gap-1" :aria-label="t('communication.editor.variables')">
        <Button
          v-for="v in variables"
          :key="v"
          type="button"
          size="sm"
          variant="outline"
          class="font-mono text-xs"
          @click="insert(v)"
          >{{ token(v) }}</Button
        >
      </div>
      <Alert v-if="unknown.length" variant="destructive" data-testid="unknown-variables">
        <AlertDescription>
          {{ t('communication.editor.unknown', unknown.length, { variables: unknown.join(', ') }) }}
        </AlertDescription>
      </Alert>
      <ErrorAlert :error="save.error.value" />
      <div class="flex gap-2">
        <Button type="submit" :disabled="!dirty || save.pending.value || unknown.length > 0">
          <SaveIcon /> {{ t('common.save') }}
        </Button>
        <Button type="button" variant="outline" :disabled="!dirty" @click="reset">{{
          t('communication.editor.discard')
        }}</Button>
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium">{{ t('communication.editor.preview') }}</p>
      <p class="rounded-md border px-3 py-2 text-sm" data-testid="preview-subject">
        {{ previewSubject }}
      </p>
      <!-- Sandboxed: template HTML never runs scripts in the app. -->
      <iframe
        :title="t('communication.editor.previewTitle')"
        sandbox=""
        class="min-h-96 w-full flex-1 rounded-md border bg-white"
        :srcdoc="preview"
        data-testid="preview-body"
      />
    </div>
  </form>
</template>
