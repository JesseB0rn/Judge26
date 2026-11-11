<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { FilePlusIcon, PencilIcon, PlusIcon, SaveIcon, SendIcon, Trash2Icon } from '@lucide/vue'
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
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import { formatDateTime } from '@/shared/format'
import type { CategoryRecord, GameRuleRecord, RulesetRecord } from '@/shared/types/records'
import {
  createDraft,
  createGameRule,
  deleteDraft,
  deleteGameRule,
  getCategory,
  listGameRules,
  listRulesets,
  publish,
  saveDraft,
  updateGameRule,
  type GameRuleInput,
} from '../api'
import { activeVersion, parseRuleset, toEditorText } from '../lib'
import GameRuleDialog from '../components/GameRuleDialog.vue'
import ExplanationTree from '../components/ExplanationTree.vue'
import RulesetBuilder from '../components/RulesetBuilder.vue'
import RulesetEditor from '../components/RulesetEditor.vue'
import EditorModeToggle from '@/shared/diagram/EditorModeToggle.vue'
import ScoreSheet from '../components/ScoreSheet.vue'

/**
 * Games of a category, each with its own versioned scoring ruleset (M2) and a live score sheet
 * preview. Rounds choose the game they play (Rounds tab of the ranking page).
 */
const props = defineProps<{ id: string }>()
const session = useSessionStore()

const category = ref<CategoryRecord>()
const rules = ref<GameRuleRecord[]>([])
/** All versions of the category; `shown` are those of the selected game. */
const versions = ref<RulesetRecord[]>([])
const { game } = useQueryRefs({ game: '' })
const selectedId = ref('')
const ruleDialog = ref(false)
const editingRule = ref<GameRuleRecord>()
const text = ref('')
const values = ref<ScoreValues>({})
const tab = ref('preview')
const editor = ref<'visual' | 'json'>('visual')
const loading = ref(true)
const loadError = ref<AppError>()

const selectedRule = computed(() => rules.value.find((r) => r.id === game.value) ?? rules.value[0])
// Without game rules (older data) all versions belong to the one implicit game.
const shown = computed(() =>
  selectedRule.value
    ? versions.value.filter((v) => v.game_rule === selectedRule.value!.id)
    : versions.value,
)
const selected = computed(() => shown.value.find((v) => v.id === selectedId.value))
const active = computed(() => activeVersion(shown.value, selectedRule.value?.id))
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
    const [c, list, r] = await Promise.all([
      getCategory(props.id),
      listRulesets(props.id),
      listGameRules(props.id),
    ])
    if (version !== loadVersion) return
    category.value = c
    versions.value = list
    rules.value = r ?? []
    const picked = select ? list.find((v) => v.id === select) : undefined
    if (picked?.game_rule) game.value = picked.game_rule
    selectedId.value = picked ? picked.id : (active.value?.id ?? shown.value[0]?.id ?? '')
  } catch (e) {
    loadError.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

// Switching the game shows its active (else latest) version.
watch(
  () => selectedRule.value?.id,
  () => {
    if (!selected.value) selectedId.value = active.value?.id ?? shown.value[0]?.id ?? ''
  },
)

watch(selected, (version) => {
  text.value = version ? toEditorText(version.definition) : ''
  values.value = {}
})

/**
 * Applies a change from a save response to the list without reloading it: listing rulesets is
 * slow (its access rule), so a reload after every action made the page sluggish. A load still
 * in flight is invalidated so it cannot overwrite the newer state.
 */
function applyLocal(next: RulesetRecord[], select?: string) {
  loadVersion++
  loading.value = false
  versions.value = next
  if (select !== undefined) selectedId.value = select
}

const newDraft = useSubmit(async () => {
  const base = selected.value ?? active.value
  const draft = await createDraft(
    props.id,
    base?.definition ?? EXAMPLE_RULESET,
    base?.id ?? '',
    selectedRule.value?.id ?? '',
  )
  applyLocal([draft, ...versions.value], draft.id)
  tab.value = 'definition'
})

const save = useSubmit(
  async () => {
    if (!selected.value || parsed.value.syntaxError) return
    const saved = await saveDraft(selected.value.id, { definition: parsed.value.definition })
    applyLocal(versions.value.map((v) => (v.id === saved.id ? saved : v)))
  },
  { success: () => t('scoring.view.draftSaved') },
)

const publishSubmit = useSubmit(
  async () => {
    if (!selected.value || !parsed.value.ruleset) return
    if (!confirm(t('scoring.view.confirmPublish', { version: selected.value.version }))) return
    const published = await publish(selected.value.id, parsed.value.definition)
    applyLocal(versions.value.map((v) => (v.id === published.id ? published : v)))
  },
  { success: () => t('scoring.view.published') },
)

const remove = useSubmit(async () => {
  if (
    !selected.value ||
    !confirm(t('scoring.view.confirmDeleteDraft', { version: selected.value.version }))
  )
    return
  const id = selected.value.id
  await deleteDraft(id)
  applyLocal(versions.value.filter((v) => v.id !== id))
  selectedId.value = active.value?.id ?? shown.value[0]?.id ?? ''
})

function openRuleDialog(rule?: GameRuleRecord) {
  editingRule.value = rule
  ruleDialog.value = true
}

async function saveRule(data: GameRuleInput) {
  if (editingRule.value) {
    await updateGameRule(editingRule.value.id, data)
    await load(selectedId.value || undefined)
  } else {
    const position = Math.max(0, ...rules.value.map((r) => r.position)) + 1
    const created = await createGameRule(props.id, { ...data, position })
    game.value = created.id
    await load()
  }
}

const removeRule = useSubmit(
  async () => {
    const rule = selectedRule.value
    if (!rule) return
    if (!confirm(t('scoring.view.confirmDeleteGame', { game: rule.name }))) return
    await deleteGameRule(rule.id)
    game.value = ''
    await load()
  },
  { success: () => t('scoring.view.gameDeleted') },
)

const actionError = computed(
  () =>
    newDraft.error.value ??
    save.error.value ??
    publishSubmit.error.value ??
    remove.error.value ??
    removeRule.error.value,
)
const label = (v: RulesetRecord) =>
  t('scoring.view.versionLabel', {
    version: v.version,
    state:
      v.status === 'published'
        ? v.id === active.value?.id
          ? t('scoring.view.active')
          : t('scoring.view.publishedState')
        : t('scoring.view.draftState'),
  })

onMounted(() => load())
</script>

<template>
  <ErrorAlert :error="loadError" />
  <Skeleton v-if="loading && !category" class="h-10 w-1/2" />
  <template v-else-if="category">
    <PageHeader
      :title="t('scoring.view.title', { category: category.name })"
      :description="
        event
          ? `${category.code} · ${event.name}`
          : `${category.code} · ${t('categories.template')}`
      "
    >
      <template #actions>
        <Button v-if="event" as-child variant="outline">
          <RouterLink :to="{ name: 'event', params: { id: event.id } }">{{
            t('rankings.view.backToEvent')
          }}</RouterLink>
        </Button>
        <Button v-else as-child variant="outline">
          <RouterLink :to="{ name: 'category-library' }">{{
            t('rankings.view.backToLibrary')
          }}</RouterLink>
        </Button>
        <Button v-if="canManage" :disabled="newDraft.pending.value" @click="newDraft.run()">
          <FilePlusIcon />
          {{ shown.length ? t('scoring.view.newDraft') : t('scoring.view.firstDraft') }}
        </Button>
      </template>
    </PageHeader>

    <ErrorAlert :error="actionError" class="mb-4" />

    <div
      v-if="rules.length || canManage"
      class="mb-4 flex flex-wrap items-center gap-2"
      data-testid="game-rules"
    >
      <span class="text-sm font-medium">{{ t('rankings.rounds.game') }}</span>
      <NativeSelect v-if="rules.length" v-model="game" :aria-label="t('rankings.rounds.game')">
        <NativeSelectOption v-for="r in rules" :key="r.id" :value="r.id">{{
          r.name
        }}</NativeSelectOption>
      </NativeSelect>
      <template v-if="canManage">
        <Button
          v-if="selectedRule"
          variant="ghost"
          size="icon"
          :aria-label="t('scoring.game.edit')"
          @click="openRuleDialog(selectedRule)"
          ><PencilIcon
        /></Button>
        <Button
          v-if="selectedRule && rules.length > 1"
          variant="ghost"
          size="icon"
          :aria-label="t('scoring.view.deleteGame')"
          :disabled="removeRule.pending.value"
          @click="removeRule.run()"
          ><Trash2Icon
        /></Button>
        <Button variant="outline" size="sm" @click="openRuleDialog()"
          ><PlusIcon /> {{ t('scoring.game.new') }}</Button
        >
      </template>
      <p v-if="rules.length > 1" class="basis-full text-sm text-muted-foreground">
        {{ t('scoring.view.gamesHint') }}
        <RouterLink
          class="underline"
          :to="{ name: 'category-ranking', params: { id: category.id }, query: { tab: 'rounds' } }"
          >{{ t('scoring.view.gamesHintLink') }}</RouterLink
        >
      </p>
      <p v-if="selectedRule?.description" class="basis-full text-sm text-muted-foreground">
        {{ selectedRule.description }}
      </p>
    </div>
    <GameRuleDialog v-model:open="ruleDialog" :rule="editingRule" :save="saveRule" />

    <Alert v-if="!shown.length" class="mb-4">
      <AlertDescription>
        {{ t('scoring.view.none') }}
        <template v-if="canManage">{{ t('scoring.view.noneHint') }}</template>
      </AlertDescription>
    </Alert>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect v-model="selectedId" :aria-label="t('scoring.view.version')">
          <NativeSelectOption v-for="v in shown" :key="v.id" :value="v.id">{{
            label(v)
          }}</NativeSelectOption>
        </NativeSelect>
        <Badge
          v-if="selected"
          :variant="selected.status === 'published' ? 'default' : 'outline'"
          data-testid="ruleset-status"
        >
          {{
            selected.status === 'published'
              ? t('events.status.published')
              : t('events.status.draft')
          }}
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
            <SaveIcon /> {{ t('teams.form.saveDraft') }}
          </Button>
          <Button
            :disabled="!parsed.ruleset || publishSubmit.pending.value"
            @click="publishSubmit.run()"
          >
            <SendIcon /> {{ t('events.detail.publish') }}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            :aria-label="t('teams.form.deleteDraft')"
            @click="remove.run()"
            ><Trash2Icon
          /></Button>
        </div>
      </div>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="preview">{{ t('scheduling.generate.previewButton') }}</TabsTrigger>
          <TabsTrigger value="definition">{{ t('scoring.view.definition') }}</TabsTrigger>
          <TabsTrigger value="history">{{ t('judging.sheet.history') }}</TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <Alert v-if="!parsed.ruleset" variant="destructive">
            <AlertDescription>{{ t('scoring.view.fixFirst') }}</AlertDescription>
          </Alert>
          <div v-else-if="result" class="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <ScoreSheet v-model="values" :ruleset="parsed.ruleset" :result="result" />
            <Card>
              <CardHeader>
                <CardTitle>{{ t('rankings.inspector.calculation') }}</CardTitle>
              </CardHeader>
              <CardContent class="flex flex-col gap-3 text-sm">
                <p v-if="result.valid" class="text-muted-foreground" data-testid="sheet-valid">
                  {{ t('scoring.view.complete') }}
                </p>
                <p v-else class="text-muted-foreground" data-testid="sheet-incomplete">
                  {{ t('scoring.view.blocking', result.issues.length) }}
                </p>
                <ul data-testid="explanation">
                  <ExplanationTree :explanation="result.explanation" />
                </ul>
                <Button variant="outline" size="sm" class="self-start" @click="values = {}">{{
                  t('scoring.view.reset')
                }}</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="definition">
          <Alert v-if="selected?.status === 'published'" class="mb-2">
            <AlertDescription>
              {{ t('scoring.view.readOnly') }}
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
                <TableHead>{{ t('scoring.view.version') }}</TableHead>
                <TableHead>{{ t('common.status') }}</TableHead>
                <TableHead>{{ t('events.status.published') }}</TableHead>
                <TableHead>{{ t('scoring.view.fingerprint') }}</TableHead>
                <TableHead>{{ t('scoring.view.notes') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="v in shown" :key="v.id">
                <TableCell>{{ v.version }}</TableCell>
                <TableCell
                  >{{
                    v.status === 'published'
                      ? t('scoring.view.publishedState')
                      : t('scoring.view.draftState')
                  }}{{ v.id === active?.id ? ` (${t('scoring.view.active')})` : '' }}</TableCell
                >
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
