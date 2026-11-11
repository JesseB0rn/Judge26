<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { PrinterIcon } from '@lucide/vue'
import {
  rank,
  defaultRankingConfig,
  EXAMPLE_RANKING_CONFIG,
  type Ranking,
  type RankingConfig,
  type TeamInput,
} from '@judge26/ranking-engine'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import LiveIndicator from '@/modules/live/components/LiveIndicator.vue'
import { useLiveUpdates } from '@/modules/live/useLiveUpdates'
import { getCategory, listGameRules, listRulesets } from '@/modules/scoring/api'
import { activeVersionForRound } from '@/modules/scoring/lib'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import ExportButtons from '@/shared/export/ExportButtons.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import { backTarget, useQueryRefs } from '@/shared/composables/useQueryRefs'
import { formatDateTime } from '@/shared/format'
import type {
  CategoryRecord,
  CompetitionDayRecord,
  GameRecord,
  RankingSnapshotRecord,
  RoundRecord,
  GameRuleRecord,
  RulesetRecord,
  TeamRecord,
} from '@/shared/types/records'
import {
  createSnapshot,
  listApprovedTeams,
  listEventDays,
  listGames,
  listRounds,
  listSnapshots,
  saveRankingConfig,
} from '../api'
import { parseRankingConfig, toTeamInputs } from '../lib'
import { rankingTable, resultsTable } from '../export'
import GameDialog from '../components/GameDialog.vue'
import RankingBuilder from '../components/RankingBuilder.vue'
import RankingConfigEditor from '../components/RankingConfigEditor.vue'
import EditorModeToggle from '@/shared/diagram/EditorModeToggle.vue'
import RankingTable from '../components/RankingTable.vue'
import ResultsMatrix from '../components/ResultsMatrix.vue'
import RoundsPanel from '../components/RoundsPanel.vue'

/** Rounds, results, ranking configuration, live ranking and snapshots of a category (M3). */
const props = defineProps<{ id: string }>()
const session = useSessionStore()

const category = ref<CategoryRecord>()
const rounds = ref<RoundRecord[]>([])
const days = ref<CompetitionDayRecord[]>([])
const teams = ref<TeamRecord[]>([])
const games = ref<GameRecord[]>([])
const snapshots = ref<RankingSnapshotRecord[]>([])
const rulesets = ref<RulesetRecord[]>([])
const gameRules = ref<GameRuleRecord[]>([])
const text = ref('')
const loading = ref(true)
const loadError = ref<AppError>()
const { tab } = useQueryRefs({ tab: 'ranking' })
// Deep link from the schedule planner: open a round's settings and offer the way back (M4-14-16).
const route = useRoute()
const editRound = computed(() =>
  typeof route.query.round === 'string' ? route.query.round : undefined,
)
const plannerBack = computed(() => {
  const from = backTarget(route.query.from)
  return from?.startsWith('/events/') ? from : undefined
})
const editor = ref<'visual' | 'json'>('visual')

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
const inputs = computed(() => toTeamInputs(teams.value, games.value, rounds.value))
const ranking = computed(() =>
  parsed.value.config ? rank(parsed.value.config, inputs.value) : undefined,
)

// Exports (M7-05, M7-06): the ranking as shown, and the results it was computed from.
function exportTables(data: { ranking: Ranking; config: RankingConfig; inputs: TeamInput[] }) {
  const context = { ...data, teams: teams.value, rounds: rounds.value }
  return [rankingTable(context), resultsTable(context)]
}
const liveExport = () =>
  exportTables({
    ranking: ranking.value!,
    config: parsed.value.definition as RankingConfig,
    inputs: inputs.value,
  })
const snapshotExport = () =>
  exportTables({
    ranking: shownSnapshot.value!.result,
    config: shownSnapshot.value!.config as RankingConfig,
    inputs: (shownSnapshot.value!.inputs as TeamInput[]) ?? [],
  })
const unknownRounds = computed(() => {
  const config = parsed.value.config
  if (!config) return []
  const existing = new Set(rounds.value.map((r) => r.key))
  return [...config.rounds.keys()].filter((key) => !existing.has(key))
})

// Incremented whenever rounds or games are reloaded, so a slower earlier load (the initial one)
// cannot overwrite newer data, e.g. a round added while the page was still loading. Rounds and
// games are tracked separately: listing rounds can take seconds (its access rule), and a saved
// result must not wait for it.
let roundsVersion = 0
let gamesVersion = 0

async function loadRounds() {
  const version = ++roundsVersion
  const r = await listRounds(props.id)
  if (version === roundsVersion) rounds.value = r
}

/** Results only: saving a game never changes the rounds. */
async function loadGames() {
  if (isTemplate.value) return
  const version = ++gamesVersion
  const g = await listGames(props.id)
  if (version === gamesVersion) games.value = g
}

async function loadResults() {
  await Promise.all([loadRounds(), loadGames()])
}

async function loadDays(eventId: string) {
  try {
    days.value = (await listEventDays(eventId)) ?? []
  } catch {
    days.value = []
  }
}

async function load() {
  loading.value = true
  const rv = ++roundsVersion
  const gv = ++gamesVersion
  try {
    category.value = await getCategory(props.id)
    text.value = savedText.value
    const template = !category.value.event
    // Days only add a field to the rounds form; they must not delay the rounds themselves.
    if (!template) void loadDays(category.value.event)
    const [r, t, g, s, rs, gr] = await Promise.all([
      listRounds(props.id),
      template ? [] : listApprovedTeams(props.id),
      template ? [] : listGames(props.id),
      template ? [] : listSnapshots(props.id),
      listRulesets(props.id),
      listGameRules(props.id),
    ])
    if (rv === roundsVersion) rounds.value = r
    if (gv === gamesVersion) games.value = g
    teams.value = t
    snapshots.value = s
    rulesets.value = rs ?? []
    gameRules.value = gr ?? []
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

// Live ranking (M6-01): reload results whenever the event's data changes, e.g. a head judge
// approves or corrects a score on another device.
const live = useLiveUpdates(() => category.value?.event || undefined, loadResults)
const updatedAt = ref<Date>()
watch(games, () => (updatedAt.value = new Date()))

// Provisional results (M6-02): games without a final result yet.
const openGames = computed(() => games.value.filter((g) => g.status === 'scheduled').length)

// Results dialog
const dialogOpen = ref(false)
const dialogTeam = ref<TeamRecord>()
const dialogRound = ref<RoundRecord>()
/** Manually recorded results are scored with the active version of the round's game. */
const dialogRuleset = computed(() =>
  dialogRound.value
    ? activeVersionForRound(dialogRound.value, gameRules.value, rulesets.value)
    : undefined,
)
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
        <Button v-if="plannerBack" as-child variant="outline">
          <RouterLink :to="plannerBack">Back to planner</RouterLink>
        </Button>
        <Button v-if="event" as-child variant="outline">
          <RouterLink
            :to="{ name: 'event', params: { id: event.id }, query: { tab: 'categories' } }"
            >Back to event</RouterLink
          >
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
          <div class="flex flex-wrap items-center gap-2">
            <LiveIndicator :status="live.status.value" :updated-at="updatedAt" />
            <span
              v-if="category.published_snapshot"
              class="text-sm text-muted-foreground"
              data-testid="publication-state"
              >Official ranking published</span
            >
            <span v-else-if="category.public_live" class="text-sm text-muted-foreground"
              >Live ranking is public</span
            >
            <div class="ml-auto flex flex-wrap gap-1">
              <ExportButtons
                :title="`ranking ${category.name}`"
                :tables="liveExport"
                :disabled="dirty"
              />
              <Button v-if="!dirty" as-child variant="outline" size="sm">
                <RouterLink :to="{ name: 'category-ranking-report', params: { id: category.id } }"
                  ><PrinterIcon /> PDF</RouterLink
                >
              </Button>
            </div>
          </div>
          <Alert v-if="dirty">
            <AlertDescription>Preview with unsaved configuration changes.</AlertDescription>
          </Alert>
          <Alert v-if="openGames" data-testid="provisional">
            <AlertDescription>
              Provisional: {{ openGames }} of {{ games.length }} games have no final result yet.
            </AlertDescription>
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
          :days="days"
          :game-rules="gameRules"
          :editable="canManage"
          :edit-round="editRound"
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
        <EditorModeToggle v-model="editor" />
        <RankingBuilder
          v-if="editor === 'visual'"
          v-model="text"
          :readonly="!canManage"
          :ranking="ranking"
        />
        <RankingConfigEditor v-else v-model="text" :readonly="!canManage" />
      </TabsContent>

      <TabsContent v-if="!isTemplate" value="snapshots" class="flex flex-col gap-3">
        <p v-if="!snapshots.length" class="text-sm text-muted-foreground">
          No snapshots published yet.
        </p>
        <template v-else>
          <NativeSelect v-model="selectedSnapshot" aria-label="Snapshot" class="max-w-md">
            <NativeSelectOption value="">Select a snapshot</NativeSelectOption>
            <NativeSelectOption v-for="s in snapshots" :key="s.id" :value="s.id">
              {{ s.title }} – {{ formatDateTime(s.created)
              }}{{ s.id === category.published_snapshot ? ' · official (public)' : '' }}
            </NativeSelectOption>
          </NativeSelect>
          <template v-if="shownSnapshot">
            <div class="flex flex-wrap gap-1">
              <ExportButtons
                :title="`${category.name} ${shownSnapshot.title}`"
                :tables="snapshotExport"
              />
              <Button as-child variant="outline" size="sm">
                <RouterLink
                  :to="{
                    name: 'category-ranking-report',
                    params: { id: category.id },
                    query: { snapshot: shownSnapshot.id },
                  }"
                  ><PrinterIcon /> PDF</RouterLink
                >
              </Button>
            </div>
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
      :ruleset="dialogRuleset"
      @saved="loadGames"
    />
  </template>
</template>
