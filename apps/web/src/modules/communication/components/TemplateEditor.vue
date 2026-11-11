<script setup lang="ts">
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
import { previewDocument, renderTemplate, SAMPLE_VALUES, unknownVariables } from '../lib'

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
const previewSubject = computed(() => renderTemplate(subject.value, SAMPLE_VALUES, false))
const preview = computed(() => previewDocument(renderTemplate(body.value, SAMPLE_VALUES, true)))

const save = useSubmit(
  async () => {
    const saved = await updateTemplate(props.template.id, {
      subject: subject.value,
      body: body.value,
      enabled: enabled.value,
    })
    emit('saved', saved)
  },
  { success: 'Template saved.' },
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
      <label class="inline-flex min-h-10 items-center gap-2 text-sm">
        <input v-model="enabled" type="checkbox" class="size-5 accent-foreground" name="enabled" />
        Send this email
      </label>
      <FormField v-slot="{ id }" label="Subject" name="subject" :errors="save.fieldErrors.value">
        <Input :id="id" v-model="subject" name="subject" required maxlength="300" />
      </FormField>
      <FormField
        v-slot="{ id }"
        label="Body (HTML)"
        name="body"
        :errors="save.fieldErrors.value"
        description="Values are inserted where a variable is written as {{name}}."
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
      <div class="flex flex-wrap gap-1" aria-label="Variables">
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
          Unknown variable{{ unknown.length > 1 ? 's' : '' }}: {{ unknown.join(', ') }}
        </AlertDescription>
      </Alert>
      <ErrorAlert :error="save.error.value" />
      <div class="flex gap-2">
        <Button type="submit" :disabled="!dirty || save.pending.value || unknown.length > 0">
          <SaveIcon /> Save
        </Button>
        <Button type="button" variant="outline" :disabled="!dirty" @click="reset">Discard</Button>
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium">Preview with example values</p>
      <p class="rounded-md border px-3 py-2 text-sm" data-testid="preview-subject">
        {{ previewSubject }}
      </p>
      <!-- Sandboxed: template HTML never runs scripts in the app. -->
      <iframe
        title="Email preview"
        sandbox=""
        class="min-h-96 w-full flex-1 rounded-md border bg-white"
        :srcdoc="preview"
        data-testid="preview-body"
      />
    </div>
  </form>
</template>
