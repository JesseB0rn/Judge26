<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { CheckIcon, CodeXmlIcon, PencilIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { setProgram } from '../api'

/**
 * The program a team plans to run (M9-B). At the robot check the judge enters it (`mode="check"`,
 * always an input); on the score sheet it is shown large above the stopwatch so the judge can
 * verify it before the start, and can be changed from there (`mode="sheet"`).
 */
const props = defineProps<{
  gameId: string
  mode: 'check' | 'sheet'
  editable: boolean
}>()
const name = defineModel<string>({ required: true })

const draft = ref(name.value)
const editing = ref(false)
const saving = ref(false)
const saved = ref(false)
const error = ref<AppError | null>(null)

watch(
  () => [props.gameId, name.value] as const,
  () => {
    if (!editing.value) draft.value = name.value
  },
)
// A different team (robot check) starts clean.
watch(
  () => props.gameId,
  () => {
    draft.value = name.value
    saved.value = false
    error.value = null
  },
)

const showInput = computed(() => props.editable && (props.mode === 'check' || editing.value))

async function save() {
  if (saving.value) return
  const value = draft.value.trim()
  if (value === name.value) {
    editing.value = false
    return
  }
  saving.value = true
  error.value = null
  try {
    const res = await setProgram(props.gameId, value)
    name.value = res.program_name
    draft.value = res.program_name
    saved.value = true
    editing.value = false
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    saving.value = false
  }
}

function edit() {
  draft.value = name.value
  editing.value = true
}

function cancel() {
  draft.value = name.value
  editing.value = false
  error.value = null
}
</script>

<template>
  <section
    class="flex flex-col gap-2 rounded-xl border-2 p-3"
    :class="name ? 'border-sky-400 bg-sky-50/60 dark:bg-sky-950/30' : 'border-dashed'"
    data-testid="program-name"
  >
    <div class="flex items-center gap-2">
      <CodeXmlIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label
        :for="`program-${gameId}`"
        class="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >{{ t('judging.program.label') }}</label
      >
      <span
        v-if="saved && !saving && !editing && mode === 'check'"
        class="ml-auto inline-flex items-center gap-1 text-sm text-emerald-700"
        data-testid="program-saved"
        ><CheckIcon class="size-4" /> {{ t('judging.save.saved') }}</span
      >
    </div>

    <form v-if="showInput" class="flex flex-wrap items-center gap-2" @submit.prevent="save">
      <Input
        :id="`program-${gameId}`"
        v-model="draft"
        class="h-12 min-w-0 flex-1 font-mono text-lg"
        maxlength="200"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="t('judging.program.placeholder')"
        @blur="mode === 'check' && save()"
      />
      <Button type="submit" size="touch" :disabled="saving">{{ t('common.save') }}</Button>
      <Button
        v-if="mode === 'sheet'"
        type="button"
        variant="outline"
        size="touch"
        @click="cancel"
        >{{ t('common.cancel') }}</Button
      >
    </form>
    <div v-else class="flex items-center gap-3">
      <p
        v-if="name"
        class="min-w-0 flex-1 truncate font-mono text-2xl font-bold"
        data-testid="program-value"
      >
        {{ name }}
      </p>
      <p v-else class="flex-1 text-muted-foreground" data-testid="program-none">
        {{ t('judging.program.none') }}
      </p>
      <Button
        v-if="editable"
        variant="ghost"
        size="icon-touch"
        :aria-label="t('judging.program.edit')"
        data-testid="program-edit"
        @click="edit"
        ><PencilIcon
      /></Button>
    </div>
    <p v-if="mode === 'sheet' && name && !showInput" class="text-sm text-muted-foreground">
      {{ t('judging.program.verify') }}
    </p>
    <p v-if="mode === 'check' && editable" class="text-sm text-muted-foreground">
      {{ t('judging.program.checkHint') }}
    </p>
    <ErrorAlert :error="error" />
  </section>
</template>
