<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeftIcon, PrinterIcon } from '@lucide/vue'
import { rank, type Ranking, type RankingConfig, type TeamInput } from '@judge26/ranking-engine'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getCategory } from '@/modules/scoring/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/format'
import type { CategoryRecord, RankingSnapshotRecord, TeamRecord } from '@/shared/types/records'
import { listApprovedTeams, listGames, listRounds, listSnapshots } from '../api'
import { formatValue, parseRankingConfig, toTeamInputs } from '../lib'

/**
 * Printable ranking report (M7-07, M7-T06): a ranking snapshot (`snapshot`) or the current live
 * ranking, laid out for A4 paper. The browser's print dialog saves it as PDF.
 */
const props = defineProps<{ id: string; snapshot?: string }>()

const category = ref<CategoryRecord>()
const teams = ref<TeamRecord[]>([])
const shown = ref<{ ranking: Ranking; config: RankingConfig; inputs: TeamInput[] }>()
const shownSnapshot = ref<RankingSnapshotRecord>()
const openGames = ref(0)
const loading = ref(true)
const error = ref<AppError>()
const missing = ref('')
const generatedAt = new Date().toISOString()

const event = computed(() => category.value?.expand?.event)
const title = computed(() =>
  shownSnapshot.value
    ? shownSnapshot.value.title
    : openGames.value
      ? 'Live ranking (provisional)'
      : 'Live ranking',
)
const organizations = computed(() => new Map(teams.value.map((t) => [t.id, t.organization])))
const hasOrganizations = computed(() => teams.value.some((t) => t.organization))

async function load() {
  try {
    category.value = await getCategory(props.id)
    teams.value = await listApprovedTeams(props.id)
    if (props.snapshot) {
      const found = (await listSnapshots(props.id)).find((s) => s.id === props.snapshot)
      if (!found) {
        missing.value = 'This snapshot does not exist or belongs to another category.'
        return
      }
      shownSnapshot.value = found
      shown.value = {
        ranking: found.result,
        config: found.config as RankingConfig,
        inputs: (found.inputs as TeamInput[]) ?? [],
      }
      return
    }
    const parsed = parseRankingConfig(
      category.value.ranking ? JSON.stringify(category.value.ranking) : '',
    )
    if (!parsed.config) {
      missing.value = 'The ranking of this category is not configured.'
      return
    }
    const [rounds, games] = await Promise.all([listRounds(props.id), listGames(props.id)])
    const inputs = toTeamInputs(teams.value, games, rounds)
    openGames.value = games.filter((g) => g.status === 'scheduled').length
    shown.value = {
      ranking: rank(parsed.config, inputs),
      config: parsed.definition as RankingConfig,
      inputs,
    }
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

function print() {
  window.print()
}

onMounted(load)
</script>

<template>
  <div class="report mx-auto max-w-4xl bg-white p-6 text-black print:max-w-none print:p-0">
    <div class="mb-6 flex flex-wrap items-center gap-2 print:hidden">
      <Button as-child variant="outline">
        <RouterLink :to="{ name: 'category-ranking', params: { id } }"
          ><ArrowLeftIcon /> Back</RouterLink
        >
      </Button>
      <Button :disabled="!shown" @click="print"><PrinterIcon /> Print / save as PDF</Button>
      <span class="text-sm text-gray-600">Choose “Save as PDF” as the printer to get a file.</span>
    </div>

    <ErrorAlert :error="error" />
    <Alert v-if="missing"
      ><AlertDescription>{{ missing }}</AlertDescription></Alert
    >
    <Skeleton v-if="loading" class="h-40 w-full" />

    <article v-if="category && shown" data-testid="ranking-report">
      <header class="mb-4 border-b-2 border-black pb-3">
        <p class="text-sm uppercase tracking-wide text-gray-600" data-testid="report-event">
          {{ event?.name }}<template v-if="event?.season"> · Season {{ event.season }}</template
          ><template v-if="event?.venue"> · {{ event.venue }}</template>
        </p>
        <h1 class="text-2xl font-bold" data-testid="report-category">
          {{ category.name }} <span class="font-normal text-gray-600">({{ category.code }})</span>
        </h1>
        <p class="text-lg" data-testid="report-title">{{ title }}</p>
      </header>

      <p v-if="!shownSnapshot && openGames" class="mb-3 text-sm" data-testid="report-provisional">
        Provisional: {{ openGames }} game{{ openGames === 1 ? ' has' : 's have' }} no final result
        yet.
      </p>

      <table class="w-full border-collapse text-sm" data-testid="report-ranking">
        <thead>
          <tr class="border-b border-black text-left">
            <th class="w-14 py-1 pr-2">Rank</th>
            <th class="py-1 pr-2">Team</th>
            <th v-if="hasOrganizations" class="py-1 pr-2">Organization</th>
            <th v-for="key in shown.ranking.keys" :key="key.label" class="py-1 pl-2 text-right">
              {{ key.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in shown.ranking.entries"
            :key="entry.team"
            class="break-inside-avoid border-b border-gray-300"
            :data-team="entry.name"
          >
            <td class="py-1 pr-2 font-semibold tabular-nums">
              {{ entry.rank ?? '–' }}<span v-if="entry.shared">=</span>
            </td>
            <td class="py-1 pr-2">
              {{ entry.name }}<span v-if="entry.provisional" class="text-gray-600"> *</span>
            </td>
            <td v-if="hasOrganizations" class="py-1 pr-2">
              {{ organizations.get(entry.team) ?? '' }}
            </td>
            <td
              v-for="(value, i) in entry.values"
              :key="i"
              class="py-1 pl-2 text-right tabular-nums"
            >
              {{ formatValue(value, shown.ranking.keys[i]!.field) }}
            </td>
          </tr>
        </tbody>
      </table>

      <footer class="mt-4 flex flex-col gap-1 text-xs text-gray-600">
        <p v-if="shown.ranking.entries.some((e) => e.provisional)">
          * Some round results of this team are missing.
        </p>
        <p v-if="shown.ranking.entries.some((e) => e.shared)">= Shared rank.</p>
        <p v-if="shownSnapshot" data-testid="report-fingerprint">
          Snapshot of {{ formatDateTime(shownSnapshot.created) }} · fingerprint
          <span class="font-mono">{{ shownSnapshot.fingerprint }}</span>
        </p>
        <p>Generated {{ formatDateTime(generatedAt) }} by Judge26.</p>
      </footer>
    </article>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4;
    margin: 15mm;
  }
  html,
  body {
    background: white !important;
  }
}
</style>
