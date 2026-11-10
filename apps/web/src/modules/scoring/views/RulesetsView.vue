<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { FilePlusIcon, SaveIcon, SendIcon, Trash2Icon } from '@lucide/vue'
import { evaluate, EXAMPLE_RULESET, type ScoreValues } from '@judge26/scoring-engine'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import type { CategoryRecord, RulesetRecord } from '@/shared/types/records'
import { createDraft, deleteDraft, getCategory, listRulesets, publish, saveDraft } from '../api'
import { parseRuleset, toEditorText } from '../lib'
import ExplanationTree from '../components/ExplanationTree.vue'
import RulesetBuilder from '../components/RulesetBuilder.vue'
import RulesetEditor from '../components/RulesetEditor.vue'
import EditorModeToggle from '@/shared/diagram/EditorModeToggle.vue'
import ScoreSheet from '../components/ScoreSheet.vue'

/** Versioned scoring rulesets of a category (M2), with a live score sheet preview. */
const props = defineProps<{ id: string }>()
const session = useSessionStore()

const category = ref<CategoryRecord>()
const versions = ref<RulesetRecord[]>([])
const selectedId = ref('')
const text = ref('')
const values = ref<ScoreValues>({})
const tab = ref('preview')
const editor = ref<'visual' | 'json'>('visual')
const loading = ref(true)
const loadError = ref<AppError>()

const selected = computed(() => versions.value.find((v) => v.id === selectedId.value))
const active = computed(() => versions.value.find((v) => v.status === 'published'))
const event = computed(() => category.value?.expand?.event)
const canManage = computed(() => {
  if (!category.value) return false
  if (!category.value.event) return session.isAdmin
  return session.canManageEvent(category.value.event) && event.value?.status !== 'archived'
})
const editable = computed(() => canManage.value && selected.value?.status === 'draft')
const parsed = computed(() => parseRuleset(text.value))
const dirty = computed(
  () => !!selected.value && text.value !== toEditorText(selected.value.definition),
)
const result = computed(() =>
  parsed.value.ruleset
    ? evaluate(parsed.value.ruleset, values.value, { mode: 'final' })
    : undefined,
)

// A slower earlier load (e.g. the initial one, still running when the first draft is created)
// must not overwrite the result of a newer one.
let loadVersion = 0

async function load(select?: string) {
  const version = ++loadVersion
  loading.value = true
  try {
    const c = await getCategory(props.id)
    const list = await listRulesets(props.id)
    if (version !== loadVersion) return
    category.value = c
    versions.value = list
    selectedId.value = select ?? active.value?.id ?? versions.value[0]?.id ?? ''
  } catch (e) {
    loadError.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

watch(selected, (version) => {
  text.value = version ? toEditorText(version.definition) : ''
  values.value = {}
})

const newDraft = useSubmit(async () => {
  const base = selected.value ?? active.value
  const draft = await createDraft(props.id, base?.definition ?? EXAMPLE_RULESET, base?.id ?? '')
  await load(draft.id)
  tab.value = 'definition'
})

const save = useSubmit(
  async () => {
    if (!selected.value || parsed.value.syntaxError) return
    const saved = await saveDraft(selected.value.id, { definition: parsed.value.definition })
    versions.value = versions.value.map((v) => (v.id === saved.id ? saved : v))
  },
  { success: 'Draft saved.' },
)

const publishSubmit = useSubmit(
  async () => {
    if (!selected.value || !parsed.value.ruleset) return
    if (
      !confirm(
        `Publish version ${selected.value.version}? Published versions can never be changed.`,
      )
    )
      return
    const published = await publish(selected.value.id, parsed.value.definition)
    await load(published.id)
  },
  { success: 'Version published.' },
)

const remove = useSubmit(async () => {
  if (!selected.value || !confirm(`Delete draft version ${selected.value.version}?`)) return
  await deleteDraft(selected.value.id)
  await load()
})

const actionError = computed(
  () => newDraft.error.value ?? save.error.value ?? publishSubmit.error.value ?? remove.error.value,
)
const label = (v: RulesetRecord) =>
  `Version ${v.version} – ${v.status === 'published' ? (v.id === active.value?.id ? 'active' : 'published') : 'draft'}`

onMounted(() => load())
</script>

<template>
  <ErrorAlert :error="loadError" />
  <Skeleton v-if="loading && !category" class="h-10 w-1/2" />
  <template v-else-if="category">
    <PageHeader
      :title="`Scoring: ${category.name}`"
      :description="event ? `${category.code} · ${event.name}` : `${category.code} · template`"
    >
      <template #actions>
        <Button v-if="event" as-child variant="outline">
          <RouterLink :to="{ name: 'event', params: { id: event.id } }">Back to event</RouterLink>
        </Button>
        <Button v-else as-child variant="outline">
          <RouterLink :to="{ name: 'category-library' }">Back to library</RouterLink>
        </Button>
        <Button v-if="canManage" :disabled="newDraft.pending.value" @click="newDraft.run()">
          <FilePlusIcon /> {{ versions.length ? 'New draft from selected' : 'Create first draft' }}
        </Button>
      </template>
    </PageHeader>

    <ErrorAlert :error="actionError" class="mb-4" />

    <Alert v-if="!versions.length" class="mb-4">
      <AlertDescription>
        No scoring ruleset yet.
        <template v-if="canManage"
          >Create a first draft; it starts from an example ruleset.</template
        >
      </AlertDescription>
    </Alert>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect v-model="selectedId" aria-label="Version">
          <NativeSelectOption v-for="v in versions" :key="v.id" :value="v.id">{{
            label(v)
          }}</NativeSelectOption>
        </NativeSelect>
        <Badge
          v-if="selected"
          :variant="selected.status === 'published' ? 'default' : 'outline'"
          data-testid="ruleset-status"
        >
          {{ selected.status === 'published' ? 'Published' : 'Draft' }}
        </Badge>
        <span v-if="selected?.fingerprint" class="font-mono text-xs text-muted-foreground">
          {{ selected.fingerprint }}
        </span>
        <div v-if="editable" class="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            :disabled="!dirty || !!parsed.syntaxError || save.pending.value"
            @click="save.run()"
          >
            <SaveIcon /> Save draft
          </Button>
          <Button
            :disabled="!parsed.ruleset || publishSubmit.pending.value"
            @click="publishSubmit.run()"
          >
            <SendIcon /> Publish
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete draft" @click="remove.run()"
            ><Trash2Icon
          /></Button>
        </div>
      </div>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="definition">Definition</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <Alert v-if="!parsed.ruleset" variant="destructive">
            <AlertDescription>Fix the definition to preview the score sheet.</AlertDescription>
          </Alert>
          <div v-else-if="result" class="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <ScoreSheet v-model="values" :ruleset="parsed.ruleset" :result="result" />
            <Card>
              <CardHeader>
                <CardTitle>Calculation</CardTitle>
              </CardHeader>
              <CardContent class="flex flex-col gap-3 text-sm">
                <p v-if="result.valid" class="text-muted-foreground" data-testid="sheet-valid">
                  Complete: this sheet could be submitted.
                </p>
                <p v-else class="text-muted-foreground" data-testid="sheet-incomplete">
                  {{ result.issues.length }} issue(s) block submission.
                </p>
                <ul data-testid="explanation">
                  <ExplanationTree :explanation="result.explanation" />
                </ul>
                <Button variant="outline" size="sm" class="self-start" @click="values = {}"
                  >Reset values</Button
                >
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="definition">
          <Alert v-if="selected?.status === 'published'" class="mb-2">
            <AlertDescription>
              Published versions are read-only. Create a new draft to make changes; existing results
              keep using the version they were scored with.
            </AlertDescription>
          </Alert>
          <EditorModeToggle v-model="editor" class="mb-3" />
          <RulesetBuilder
            v-if="editor === 'visual'"
            v-model="text"
            :readonly="!editable"
            :explanation="Object.keys(values).length ? result?.explanation : undefined"
          />
          <RulesetEditor v-else v-model="text" :readonly="!editable" />
        </TabsContent>

        <TabsContent value="history">
          <Table data-testid="ruleset-history">
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="v in versions" :key="v.id">
                <TableCell>{{ v.version }}</TableCell>
                <TableCell>{{ v.status }}{{ v.id === active?.id ? ' (active)' : '' }}</TableCell>
                <TableCell>{{ formatDateTime(v.published_at) }}</TableCell>
                <TableCell class="font-mono text-xs">{{ v.fingerprint || '–' }}</TableCell>
                <TableCell class="whitespace-normal">{{ v.notes || '–' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </template>
  </template>
</template>
