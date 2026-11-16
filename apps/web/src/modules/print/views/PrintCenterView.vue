<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ArrowLeftIcon, PrinterIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import QrCode from '@/shared/components/QrCode.vue'
import { isPublicEvent, liveRankingUrl } from '@/modules/live/lib'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import { getPrintData } from '../api'
import {
  categoryOf,
  dayLabel,
  filterTeams,
  roundOptions,
  tablePages,
  teamSchedule,
  teamTables,
} from '../lib'
import type { PrintData, PrintoutKind, TableVariant } from '../types'

/**
 * Print center (M10-31): printouts for the venue, one A4 page per record — robot parking labels
 * and workplace sheets per team (M10-32, M10-33), table assignments per table of a round
 * (M10-34). Filters by category and day; records can be left out; the browser prints the pages
 * or saves them as PDF, like the reports of M7-07.
 */
const props = defineProps<{ id: string }>()

const data = ref<PrintData | null>(null)
const loading = ref(true)
const error = ref<AppError | null>(null)
const { kind, category, day, round, variant } = useQueryRefs({
  kind: 'parking',
  category: '',
  day: '',
  round: '',
  variant: 'both',
})
const ALL_KINDS: PrintoutKind[] = ['parking', 'workplace', 'tables', 'qr']
/** The QR poster only while the event is public (M10-35). */
const KINDS = computed(() =>
  ALL_KINDS.filter((k) => k !== 'qr' || (data.value && isPublicEvent(data.value.event.status))),
)
const router = useRouter()
const rankingUrl = computed(() =>
  liveRankingUrl(router.resolve({ name: 'live-event', params: { id: props.id } }).href),
)
const VARIANTS: TableVariant[] = ['teams', 'judges', 'both']
const shownKind = computed<PrintoutKind>(() =>
  KINDS.value.includes(kind.value as PrintoutKind) ? (kind.value as PrintoutKind) : 'parking',
)
const shownVariant = computed<TableVariant>(() =>
  VARIANTS.includes(variant.value as TableVariant) ? (variant.value as TableVariant) : 'both',
)

// A4 without margins while the print center is open; removed on leaving, so other printouts
// (e.g. the ranking report) keep the browser's page settings.
const pageStyle = document.createElement('style')
pageStyle.textContent = '@page { size: A4; margin: 0; }'

onBeforeUnmount(() => pageStyle.remove())

onMounted(async () => {
  document.head.appendChild(pageStyle)
  try {
    data.value = await getPrintData(props.id)
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
})

const filter = computed(() => ({ category: category.value, day: day.value }))
const teams = computed(() => (data.value ? filterTeams(data.value, filter.value) : []))
const rounds = computed(() => (data.value ? roundOptions(data.value, filter.value) : []))
const shownRound = computed(() => rounds.value.find((r) => r.id === round.value) ?? rounds.value[0])
const tables = computed(() =>
  data.value && shownRound.value ? tablePages(data.value, shownRound.value.id) : [],
)

/** The records of the current printout: one page each. */
const records = computed(() => {
  if (shownKind.value === 'qr') return [{ id: 'qr', label: t('print.kinds.qr') }]
  return shownKind.value === 'tables'
    ? tables.value.map((p) => ({ id: p.table.id, label: p.table.name }))
    : teams.value.map((team) => ({ id: team.id, label: team.name }))
})
/** Records left out of the printout; reset when the printout or the filters change. */
const excluded = ref<string[]>([])
watch([shownKind, category, day, () => shownRound.value?.id], () => (excluded.value = []))
const isIncluded = (id: string) => !excluded.value.includes(id)
function toggle(id: string, on: boolean) {
  excluded.value = on ? excluded.value.filter((x) => x !== id) : [...excluded.value, id]
}
const selectedCount = computed(() => records.value.filter((r) => isIncluded(r.id)).length)

const shownTeams = computed(() => teams.value.filter((team) => isIncluded(team.id)))
const shownTables = computed(() => tables.value.filter((p) => isIncluded(p.table.id)))

const categoryLabel = (id: string) => {
  const c = data.value ? categoryOf(data.value, id) : undefined
  return c ? `${c.name} (${c.code})` : ''
}
/** Larger names for shorter names, so a label is readable from 2 m (M10-32). */
const nameSize = (name: string) =>
  name.length <= 18 ? 'text-[72pt]' : name.length <= 36 ? 'text-[54pt]' : 'text-[40pt]'

function print() {
  window.print()
}
</script>

<template>
  <div class="print-center">
    <div class="flex flex-col gap-4 print:hidden">
      <RouterLink
        :to="{ name: 'event', params: { id } }"
        class="inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon class="size-4" /> {{ data?.event.name ?? t('print.back') }}
      </RouterLink>
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('print.title') }}</h1>
        <p class="text-muted-foreground">{{ t('print.description') }}</p>
      </div>
      <ErrorAlert :error="error" />
      <Skeleton v-if="loading" class="h-32 w-full" />

      <template v-if="data">
        <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('print.kind')">
          <Button
            v-for="k in KINDS"
            :key="k"
            role="radio"
            :aria-checked="shownKind === k"
            :variant="shownKind === k ? 'default' : 'outline'"
            :data-kind="k"
            @click="kind = k"
            >{{ t(`print.kinds.${k}`) }}</Button
          >
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <label v-if="shownKind !== 'qr'" class="flex flex-col gap-1 text-sm font-medium">
            {{ t('print.category') }}
            <NativeSelect v-model="category" data-testid="print-category">
              <NativeSelectOption value="">{{ t('print.all') }}</NativeSelectOption>
              <NativeSelectOption v-for="c in data.categories" :key="c.id" :value="c.id">{{
                `${c.name} (${c.code})`
              }}</NativeSelectOption>
            </NativeSelect>
          </label>
          <label
            v-if="data.days.length && shownKind !== 'qr'"
            class="flex flex-col gap-1 text-sm font-medium"
          >
            {{ t('print.day') }}
            <NativeSelect v-model="day" data-testid="print-day">
              <NativeSelectOption value="">{{ t('print.all') }}</NativeSelectOption>
              <NativeSelectOption v-for="d in data.days" :key="d.id" :value="d.id">{{
                dayLabel(data, d.id)
              }}</NativeSelectOption>
            </NativeSelect>
          </label>
          <template v-if="shownKind === 'tables'">
            <label class="flex flex-col gap-1 text-sm font-medium">
              {{ t('print.round') }}
              <NativeSelect
                :model-value="shownRound?.id ?? ''"
                data-testid="print-round"
                @update:model-value="round = String($event)"
              >
                <NativeSelectOption v-for="r in rounds" :key="r.id" :value="r.id">{{
                  `${r.key} · ${r.name} · ${categoryOf(data, r.category)?.code ?? ''}`
                }}</NativeSelectOption>
              </NativeSelect>
            </label>
            <label class="flex flex-col gap-1 text-sm font-medium">
              {{ t('print.variant') }}
              <NativeSelect v-model="variant" data-testid="print-variant">
                <NativeSelectOption v-for="v in VARIANTS" :key="v" :value="v">{{
                  t(`print.variants.${v}`)
                }}</NativeSelectOption>
              </NativeSelect>
            </label>
          </template>
          <Button :disabled="!selectedCount" data-testid="print-button" @click="print"
            ><PrinterIcon /> {{ t('print.print', selectedCount) }}</Button
          >
        </div>
        <p class="text-sm text-muted-foreground">{{ t('rankings.report.printHint') }}</p>

        <details
          v-if="shownKind !== 'qr'"
          class="rounded-lg border p-3"
          data-testid="print-selection"
        >
          <summary class="cursor-pointer text-sm font-medium">
            {{ t('print.selection', { selected: selectedCount, total: records.length }) }}
          </summary>
          <div class="mt-2 flex gap-3 text-sm">
            <button type="button" class="underline" @click="excluded = []">
              {{ t('print.selectAll') }}
            </button>
            <button type="button" class="underline" @click="excluded = records.map((r) => r.id)">
              {{ t('print.selectNone') }}
            </button>
          </div>
          <ul class="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="r in records" :key="r.id">
              <label class="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  :checked="isIncluded(r.id)"
                  :data-record="r.id"
                  @change="toggle(r.id, ($event.target as HTMLInputElement).checked)"
                />
                {{ r.label }}
              </label>
            </li>
          </ul>
        </details>
        <p
          v-if="!records.length"
          class="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
          data-testid="print-empty"
        >
          {{ shownKind === 'tables' ? t('print.noTables') : t('print.noTeams') }}
        </p>
      </template>
    </div>

    <!-- The pages: previewed on screen, one A4 sheet each when printed. -->
    <div
      v-if="data"
      class="mt-6 overflow-x-auto print:mt-0 print:overflow-visible"
      data-testid="print-pages"
    >
      <template v-if="shownKind === 'parking'">
        <section
          v-for="team in shownTeams"
          :key="team.id"
          class="print-page flex flex-col justify-center gap-8 text-center"
          data-page="parking"
          :data-record="team.id"
        >
          <p class="text-[20pt] tracking-wide text-gray-600 uppercase">
            {{ t('print.parking.heading') }}
          </p>
          <h2 class="font-bold leading-tight break-words hyphens-auto" :class="nameSize(team.name)">
            {{ team.name }}
          </h2>
          <p class="text-[32pt] font-semibold">{{ categoryLabel(team.category) }}</p>
          <p v-if="team.organization" class="text-[26pt]">{{ team.organization }}</p>
          <p class="mt-auto text-[11pt] text-gray-600">{{ data.event.name }}</p>
        </section>
      </template>

      <template v-else-if="shownKind === 'workplace'">
        <section
          v-for="team in shownTeams"
          :key="team.id"
          class="print-page flex flex-col gap-6"
          data-page="workplace"
          :data-record="team.id"
        >
          <header class="border-b-2 border-black pb-4">
            <p class="text-[12pt] tracking-wide text-gray-600 uppercase">
              {{ data.event.name }} · {{ t('print.workplace.heading') }}
            </p>
            <h2 class="text-[40pt] leading-tight font-bold break-words hyphens-auto">
              {{ team.name }}
            </h2>
            <p class="text-[18pt]">
              {{ categoryLabel(team.category)
              }}<template v-if="team.organization"> · {{ team.organization }}</template>
            </p>
          </header>

          <div data-testid="workplace-tables">
            <h3 class="mb-2 text-[16pt] font-semibold">{{ t('print.workplace.tables') }}</h3>
            <p v-if="!teamTables(data, team).length" class="text-[13pt]">
              {{ t('print.workplace.noTable') }}
            </p>
            <p
              v-for="table in teamTables(data, team)"
              :key="table.id"
              class="text-[14pt]"
              :data-table="table.name"
            >
              <span class="text-[22pt] font-bold">{{ table.name }}</span>
              <template v-if="table.judges.length">
                · {{ t('print.judges') }}:
                {{ table.judges.map((j) => j.name).join(', ') }}</template
              >
            </p>
          </div>

          <div>
            <h3 class="mb-2 text-[16pt] font-semibold">{{ t('print.workplace.schedule') }}</h3>
            <table class="w-full border-collapse text-[12pt]" data-testid="workplace-schedule">
              <thead>
                <tr class="border-b border-black text-left">
                  <th class="py-1 pr-2">{{ t('print.round') }}</th>
                  <th class="py-1 pr-2">{{ t('print.what') }}</th>
                  <th class="py-1 pr-2">{{ t('print.day') }}</th>
                  <th class="py-1 pr-2">{{ t('print.time') }}</th>
                  <th class="py-1 pr-2">{{ t('print.table') }}</th>
                  <th class="py-1">#</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="line in teamSchedule(data, team)"
                  :key="line.key"
                  class="border-b border-gray-300"
                >
                  <td class="py-1 pr-2">{{ line.round }}</td>
                  <td class="py-1 pr-2">{{ line.what }}</td>
                  <td class="py-1 pr-2">{{ line.day || '–' }}</td>
                  <td class="py-1 pr-2 tabular-nums">{{ line.time || '–' }}</td>
                  <td class="py-1 pr-2 font-semibold">{{ line.table }}</td>
                  <td class="py-1 tabular-nums">{{ line.sequence || '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <template v-else-if="shownKind === 'qr'">
        <!-- M10-35: poster with the QR code of the public live ranking. -->
        <section
          v-if="isIncluded('qr')"
          class="print-page flex flex-col items-center justify-center gap-10 text-center"
          data-page="qr"
          data-record="qr"
        >
          <p class="text-[20pt] tracking-wide text-gray-600 uppercase">{{ data.event.name }}</p>
          <h2 class="text-[54pt] leading-tight font-bold">{{ t('print.qr.heading') }}</h2>
          <QrCode class="size-[130mm]" :value="rankingUrl" :label="t('live.qr.label')" />
          <p class="text-[20pt]">{{ t('print.qr.scan') }}</p>
          <p class="text-[13pt] break-all text-gray-600">{{ rankingUrl }}</p>
        </section>
      </template>

      <template v-else>
        <section
          v-for="page in shownTables"
          :key="page.table.id"
          class="print-page flex flex-col gap-6"
          data-page="table"
          :data-record="page.table.id"
        >
          <header class="border-b-2 border-black pb-4">
            <p class="text-[12pt] tracking-wide text-gray-600 uppercase">
              {{ data.event.name }}
              <template v-if="shownRound">
                · {{ shownRound.key }} · {{ shownRound.name }} ·
                {{ categoryLabel(shownRound.category) }}</template
              >
            </p>
            <h2 class="text-[60pt] leading-tight font-bold">{{ page.table.name }}</h2>
            <p v-if="shownRound?.day" class="text-[16pt]">{{ dayLabel(data, shownRound.day) }}</p>
          </header>
          <div v-if="shownVariant !== 'teams'" data-testid="table-judges">
            <h3 class="mb-2 text-[18pt] font-semibold">{{ t('print.judges') }}</h3>
            <p v-if="!page.table.judges.length" class="text-[14pt]">{{ t('print.noJudges') }}</p>
            <ul class="text-[22pt]">
              <li v-for="judge in page.table.judges" :key="judge.id">{{ judge.name }}</li>
            </ul>
          </div>
          <div v-if="shownVariant !== 'judges'" data-testid="table-teams">
            <h3 class="mb-2 text-[18pt] font-semibold">{{ t('print.teams') }}</h3>
            <ol class="flex flex-col gap-1 text-[20pt]">
              <li
                v-for="team in page.teams"
                :key="team.game"
                class="flex gap-4 border-b border-gray-300 py-1"
                :data-team="team.name"
              >
                <span class="w-12 shrink-0 text-right font-bold tabular-nums">{{
                  team.sequence
                }}</span>
                <span class="min-w-0 flex-1 break-words">
                  {{ team.name
                  }}<template v-if="team.attempt > 1">
                    · {{ t('judging.attempt', { attempt: team.attempt }) }}</template
                  >
                  <span v-if="team.organization" class="block text-[13pt] text-gray-600">{{
                    team.organization
                  }}</span>
                </span>
              </li>
            </ol>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style>
/* One A4 sheet per record (M10-31). */
.print-page {
  box-sizing: border-box;
  width: 210mm;
  height: 297mm;
  padding: 18mm;
  margin: 0 auto 1.5rem;
  overflow: hidden;
  background: white;
  color: black;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.2);
}

@media print {
  .print-page {
    /* A hair under A4: sub-pixel rounding would otherwise spill a blank page after the last. */
    height: calc(297mm - 1px);
    margin: 0;
    box-shadow: none;
    break-after: page;
  }
  .print-page:last-child {
    break-after: auto;
  }
}
</style>
