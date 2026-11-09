<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  rank,
  defaultRankingConfig,
  EXAMPLE_RANKING_CONFIG,
  type RankingConfig,
} from '@judge26/ranking-engine'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getCategory, listRulesets } from '@/modules/scoring/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import type {
  CategoryRecord,
  GameRecord,
  RankingSnapshotRecord,
  RoundRecord,
  RulesetRecord,
  TeamRecord,
} from '@/shared/types/records'
import {
  createSnapshot,
  listApprovedTeams,
  listGames,
  listRounds,
  listSnapshots,
  saveRankingConfig,
} from '../api'
import { parseRankingConfig, toTeamInputs } from '../lib'
import GameDialog from '../components/GameDialog.vue'
import RankingConfigEditor from '../components/RankingConfigEditor.vue'
import RankingTable from '../components/RankingTable.vue'
import ResultsMatrix from '../components/ResultsMatrix.vue'
import RoundsPanel from '../components/RoundsPanel.vue'

/** Rounds, results, ranking configuration, live ranking and snapshots of a category (M3). */
const props = defineProps<{ id: string }>()
const session = useSessionStore()

const category = ref<CategoryRecord>()
const rounds = ref<RoundRecord[]>([])
const teams = ref<TeamRecord[]>([])
const games = ref<GameRecord[]>([])
const snapshots = ref<RankingSnapshotRecord[]>([])
const ruleset = ref<RulesetRecord>()
const text = ref('')
const loading = ref(true)
const loadError = ref<AppError>()
const tab = ref('ranking')

const event = computed(() => category.value?.expand?.event)
const isTemplate = computed(() => !!category.value && !category.value.event)
const canManage = computed(() => {
  if (!category.value) return false
  if (isTemplate.value) return session.isAdmin
  return session.canManageEvent(category.value.event) && event.value?.status !== 'archived'
})
const savedText = computed(() =>
  category.value?.ranking ? JSON.stringify(category.value.ranking, null, 2) : '',
)
const parsed = computed(() => parseRankingConfig(text.value))
const dirty = computed(() => text.value !== savedText.value)
const ranking = computed(() =>
  parsed.value.config
    ? rank(parsed.value.config, toTeamInputs(teams.value, games.value, rounds.value))
    : undefined,
)
const unknownRounds = computed(() => {
  const config = parsed.value.config
  if (!config) return []
  const existing = new Set(rounds.value.map((r) => r.key))
  return [...config.rounds.keys()].filter((key) => !existing.has(key))
})

async function loadResults() {
  ;[rounds.value, games.value] = await Promise.all([
    listRounds(props.id),
    isTemplate.value ? [] : listGames(props.id),
  ])
}

async function load() {
  loading.value = true
  try {
    category.value = await getCategory(props.id)
    text.value = savedText.value
    const template = !category.value.event
    const [r, t, g, s, rs] = await Promise.all([
      listRounds(props.id),
      template ? [] : listApprovedTeams(props.id),
      template ? [] : listGames(props.id),
      template ? [] : listSnapshots(props.id),
      listRulesets(props.id),
    ])
    rounds.value = r
    teams.value = t
    games.value = g
    snapshots.value = s
    ruleset.value = rs.find((v) => v.status === 'published')
    if (template) tab.value = 'rounds'
  } catch (e) {
    loadError.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

const saveConfig = useSubmit(
  async () => {
    category.value = {
      ...category.value!,
      ...(await saveRankingConfig(props.id, parsed.value.definition ?? null)),
    }
    text.value = savedText.value
  },
  { success: 'Ranking configuration saved.' },
)

function useTemplate(config: RankingConfig) {
  text.value = JSON.stringify(config, null, 2)
  tab.value = 'configuration'
}

// Results dialog
const dialogOpen = ref(false)
const dialogTeam = ref<TeamRecord>()
const dialogRound = ref<RoundRecord>()
function openGame(team: TeamRecord, round: RoundRecord) {
  dialogTeam.value = team
  dialogRound.value = round
  dialogOpen.value = true
}

// Snapshots
const snapshotTitle = ref('')
const selectedSnapshot = ref('')
const shownSnapshot = computed(() => snapshots.value.find((s) => s.id === selectedSnapshot.value))
const publish = useSubmit(
  async () => {
    const created = await createSnapshot(props.id, snapshotTitle.value)
    snapshots.value = [created, ...snapshots.value]
    selectedSnapshot.value = created.id
    snapshotTitle.value = ''
    tab.value = 'snapshots'
  },
  { success: 'Ranking snapshot published.' },
)

onMounted(load)
</script>

<template>
  <ErrorAlert :error="loadError" />
  <Skeleton v-if="loading && !category" class="h-10 w-1/2" />
  <template v-else-if="category">
    <PageHeader
      :title="`Rounds & ranking: ${category.name}`"
      :description="event ? `${category.code} · ${event.name}` : `${category.code} · template`"
    >
      <template #actions>
        <Button v-if="event" as-child variant="outline">
          <RouterLink :to="{ name: 'event', params: { id: event.id } }">Back to event</RouterLink>
        </Button>
        <Button v-else as-child variant="outline">
          <RouterLink :to="{ name: 'category-library' }">Back to library</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <Tabs v-model="tab">
      <TabsList>
        <TabsTrigger v-if="!isTemplate" value="ranking">Ranking</TabsTrigger>
        <TabsTrigger v-if="!isTemplate" value="results">Results</TabsTrigger>
        <TabsTrigger value="rounds">Rounds</TabsTrigger>
        <TabsTrigger value="configuration">Configuration</TabsTrigger>
        <TabsTrigger v-if="!isTemplate" value="snapshots">Snapshots</TabsTrigger>
      </TabsList>

      <TabsContent v-if="!isTemplate" value="ranking" class="flex flex-col gap-4">
        <Alert v-if="!parsed.config">
          <AlertDescription>Configure the ranking to see results.</AlertDescription>
        </Alert>
        <template v-else-if="ranking">
          <Alert v-if="dirty">
            <AlertDescription>Preview with unsaved configuration changes.</AlertDescription>
          </Alert>
          <RankingTable :ranking="ranking" :config="parsed.config.config" />
          <p
            v-if="ranking.issues.length"
            class="text-sm text-destructive"
            data-testid="ranking-issues"
          >
            {{ ranking.issues.length }} result(s) ignored:
            {{ ranking.issues.map((i) => i.message).join(' ') }}
          </p>
          <form
            v-if="canManage"
            class="flex flex-wrap items-end gap-2"
            @submit.prevent="publish.run()"
          >
            <Input
              v-model="snapshotTitle"
              class="max-w-xs"
              placeholder="e.g. Official ranking day 1"
              aria-label="Snapshot title"
              required
            />
            <Button type="submit" :disabled="publish.pending.value || dirty"
              >Publish snapshot</Button
            >
            <span v-if="dirty" class="text-sm text-muted-foreground"
              >Save the configuration first.</span
            >
          </form>
          <ErrorAlert :error="publish.error.value" />
        </template>
      </TabsContent>

      <TabsContent v-if="!isTemplate" value="results">
        <Alert v-if="!rounds.length"><AlertDescription>Add rounds first.</AlertDescription></Alert>
        <ResultsMatrix
          v-else
          :teams="teams"
          :rounds="rounds"
          :games="games"
          :editable="canManage"
          @open="openGame"
        />
      </TabsContent>

      <TabsContent value="rounds">
        <RoundsPanel
          :category-id="category.id"
          :rounds="rounds"
          :editable="canManage"
          @changed="loadResults"
        />
      </TabsContent>

      <TabsContent value="configuration" class="flex flex-col gap-3">
        <div v-if="canManage" class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            :disabled="!rounds.length"
            @click="
              useTemplate(defaultRankingConfig(rounds.map((r) => ({ key: r.key, label: r.name }))))
            "
          >
            Generate from rounds
          </Button>
          <Button variant="outline" @click="useTemplate(EXAMPLE_RANKING_CONFIG)"
            >Load example</Button
          >
          <Button
            class="ml-auto"
            :disabled="
              !dirty || !!parsed.syntaxError || parsed.issues.length > 0 || saveConfig.pending.value
            "
            @click="saveConfig.run()"
          >
            Save configuration
          </Button>
        </div>
        <ErrorAlert :error="saveConfig.error.value" />
        <Alert v-if="unknownRounds.length" variant="destructive">
          <AlertDescription>
            The configuration references rounds that do not exist yet:
            {{ unknownRounds.join(', ') }}. Their results count as missing.
          </AlertDescription>
        </Alert>
        <RankingConfigEditor v-model="text" :readonly="!canManage" />
      </TabsContent>

      <TabsContent v-if="!isTemplate" value="snapshots" class="flex flex-col gap-3">
        <p v-if="!snapshots.length" class="text-sm text-muted-foreground">
          No snapshots published yet.
        </p>
        <template v-else>
          <NativeSelect v-model="selectedSnapshot" aria-label="Snapshot" class="max-w-md">
            <NativeSelectOption value="">Select a snapshot</NativeSelectOption>
            <NativeSelectOption v-for="s in snapshots" :key="s.id" :value="s.id">
              {{ s.title }} – {{ formatDateTime(s.created) }}
            </NativeSelectOption>
          </NativeSelect>
          <template v-if="shownSnapshot">
            <p class="font-mono text-xs text-muted-foreground" data-testid="snapshot-fingerprint">
              Fingerprint {{ shownSnapshot.fingerprint }} · configuration
              {{ shownSnapshot.config_fingerprint }}
            </p>
            <RankingTable
              :ranking="shownSnapshot.result"
              :config="shownSnapshot.config as RankingConfig"
            />
          </template>
        </template>
      </TabsContent>
    </Tabs>

    <GameDialog
      v-if="!isTemplate"
      v-model:open="dialogOpen"
      :team="dialogTeam"
      :round="dialogRound"
      :games="games"
      :ruleset="ruleset"
      @saved="loadResults"
    />
  </template>
</template>
