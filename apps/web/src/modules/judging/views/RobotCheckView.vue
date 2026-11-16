<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudOffIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileTextIcon,
  LockIcon,
  PlayIcon,
  Undo2Icon,
} from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useFileToken } from '@/shared/composables/useFileToken'
import { backTarget, useQueryRefs } from '@/shared/composables/useQueryRefs'
import type { TeamDocumentRecord } from '@/shared/types/records'
import { documentKind, documentUrl, listTeamDocuments } from '@/modules/teams/documents'
import { formatTimeOfDay } from '@/shared/format'
import { useLiveUpdates } from '@/modules/live/useLiveUpdates'
import { getTableCheck, listAssignments, setTableReady, setTeamCheck } from '../api'
import {
  cacheAssignments,
  cachedAssignments,
  finishedChecks,
  installAutoSync,
  pendingChecks,
  queueCheck,
  syncPendingChecks,
} from '../drafts'
import { isCheckDone, robotChecks, timeRange, type RobotCheckBlock } from '../lib'
import type { Assignment, TableCheckState } from '../types'
import ProgramNameField from '../components/ProgramNameField.vue'
import RoundFilePanel from '../components/RoundFilePanel.vue'
import MarqueeText from '@/shared/components/MarqueeText.vue'

/**
 * Guided robot check (M5-15): steps through the teams of one round at the judge's table in
 * playing order and shows each team's documents (M1-13). The current team is in the URL.
 * Each checked team and the table's completion are stored on the server, so every device of the
 * table and the head judge see the same state (M10-10); checks entered offline are queued and
 * sent when the connection is back.
 */
const props = defineProps<{ roundId: string }>()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { token } = useFileToken()

const block = ref<RobotCheckBlock>()
const documents = ref<TeamDocumentRecord[]>([])
const loading = ref(true)
const error = ref<AppError | null>(null)
const documentsError = ref<AppError | null>(null)
const offline = ref(false)
const rows = ref<Assignment[]>([])
const finished = ref<string[]>([])
/** The table's check on the server (M10-10); null offline. */
const state = ref<TableCheckState | null>(null)
/** Checks entered on this device that have not reached the server yet, by team. */
const queued = ref<Record<string, boolean>>({})
const busy = ref(false)
const actionError = ref<AppError | null>(null)
const userId = () => session.user?.id ?? ''

const scoringStarted = computed(
  () =>
    !!block.value &&
    (isCheckDone(block.value, rows.value.map(withoutCheckState), []) ||
      !!state.value?.teams.some((t) => t.scoring_started)),
)
// Done once the table confirmed it on the server, or once scoring has started at this table.
// Without the server state (offline), the device's own copy decides.
const done = computed(() => {
  if (!block.value) return false
  if (state.value) return !!state.value.ready || scoringStarted.value
  return isCheckDone(block.value, rows.value, finished.value)
})
const locked = computed(() => !!state.value?.parts_check)
const readOnly = computed(() => block.value?.event.status === 'archived')

function withoutCheckState(row: Assignment): Assignment {
  return { ...row, robot_check: undefined }
}

const serverTeam = (id: string) => state.value?.teams.find((t) => t.id === id)
const isChecked = (id: string) => queued.value[id] ?? serverTeam(id)?.checked ?? false
const unchecked = computed(() => teams.value.filter((t) => !isChecked(t.id)).length)

/** Checks or reopens the current team; offline the change is queued (M10-10). */
async function toggleCheck(teamId: string) {
  if (!block.value) return
  const checked = !isChecked(teamId)
  const savedAt = Date.now()
  actionError.value = null
  try {
    const { team } = await setTeamCheck(props.roundId, teamId, checked, savedAt)
    if (state.value) {
      state.value = {
        ...state.value,
        ready: checked ? state.value.ready : null,
        teams: state.value.teams.map((t) => (t.id === team.id ? team : t)),
      }
    }
  } catch (e) {
    const err = toAppError(e)
    if (err.kind !== 'network') {
      actionError.value = err
      return
    }
    queueCheck({ roundId: props.roundId, teamId, checked, savedAt })
    queued.value = { ...queued.value, [teamId]: checked }
    offline.value = true
  }
}

/** The table's check is complete: ready for the run (M10-11), and back to the dashboard. */
async function finish() {
  if (!block.value || !tableId.value) return
  if (unchecked.value && !confirm(t('checks.robot.confirmReady', unchecked.value))) return
  busy.value = true
  actionError.value = null
  try {
    state.value = await setTableReady(props.roundId, tableId.value, true)
    await router.push(back.value)
  } catch (e) {
    actionError.value = toAppError(e)
  } finally {
    busy.value = false
  }
}

async function reopen() {
  if (!block.value || !tableId.value) return
  busy.value = true
  actionError.value = null
  try {
    state.value = await setTableReady(props.roundId, tableId.value, false)
  } catch (e) {
    actionError.value = toAppError(e)
  } finally {
    busy.value = false
  }
}

function checkedAt(teamId: string) {
  const team = serverTeam(teamId)
  if (!team?.checked || queued.value[teamId] !== undefined) return ''
  return [team.checked_by?.name, team.checked_at ? formatTimeOfDay(team.checked_at) : '']
    .filter(Boolean)
    .join(' · ')
}

const { team: teamId } = useQueryRefs({ team: '' })
const tableQuery = computed(() =>
  typeof route.query.table === 'string' ? route.query.table : undefined,
)
const tableId = computed(() => tableQuery.value ?? block.value?.table?.id)
/** The table a head judge stepped in at (M10-07): its games instead of the user's own. */
const seat = computed(() => (typeof route.query.seat === 'string' ? route.query.seat : ''))
const cacheKey = () => `${userId()}${seat.value ? `@${seat.value}` : ''}`

const back = computed(() => backTarget(route.query.from) ?? '/judging')
const teams = computed(() => block.value?.teams ?? [])
const index = computed(() => {
  const found = teams.value.findIndex((t) => t.id === teamId.value)
  return found === -1 ? 0 : found
})
const current = computed(() => teams.value[index.value])
const currentDocs = computed(() => documents.value.filter((d) => d.team === current.value?.id))
const countFor = (id: string) => documents.value.filter((d) => d.team === id).length

const when = computed(() => {
  const check = block.value?.check
  if (!check) return ''
  const day = check.day ? check.day.label || check.day.date : ''
  return [day, timeRange(check.starts_at, check.duration_minutes)].filter(Boolean).join(' · ')
})

/** Keeps the recorded program in the team list and the device copy of the games (M9-06). */
function programSaved(value: string) {
  const team = current.value
  if (!team) return
  team.program_name = value
  rows.value = rows.value.map((r) =>
    r.team.id === team.id && r.round.id === props.roundId ? { ...r, program_name: value } : r,
  )
  if (!offline.value) cacheAssignments(cacheKey(), rows.value)
}

function go(to: number) {
  const team = teams.value[Math.max(0, Math.min(teams.value.length - 1, to))]
  if (team) teamId.value = team.id
}

function findBlock(rows: Parameters<typeof robotChecks>[0]) {
  return robotChecks(rows).find(
    (b) =>
      b.round.id === props.roundId &&
      (tableQuery.value === undefined || b.table?.id === tableQuery.value),
  )
}

/** The table's check from the server, with the changes still queued on this device. */
async function loadState() {
  if (!block.value?.table) return
  await syncPendingChecks()
  const mine = pendingChecks(props.roundId)
  queued.value = Object.fromEntries(mine.map((c) => [c.teamId, c.checked]))
  state.value = await getTableCheck(props.roundId, block.value.table.id)
}

async function load() {
  loading.value = true
  error.value = null
  finished.value = finishedChecks(userId())
  try {
    let loaded
    try {
      loaded = await listAssignments(seat.value || undefined)
      offline.value = false
    } catch (e) {
      const err = toAppError(e)
      loaded = err.kind === 'network' ? cachedAssignments(cacheKey()) : null
      if (!loaded) throw e
      offline.value = true
    }
    rows.value = loaded
    block.value = findBlock(loaded)
    if (!block.value) return
    if (!offline.value) await loadState()
    else
      queued.value = Object.fromEntries(
        pendingChecks(props.roundId).map((c) => [c.teamId, c.checked]),
      )
    documentsError.value = null
    try {
      documents.value = await listTeamDocuments(block.value.teams.map((t) => t.id))
    } catch (e) {
      documentsError.value = toAppError(e)
    }
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

function onKey(event: KeyboardEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]'))
    return
  if (event.key === 'ArrowRight') go(index.value + 1)
  else if (event.key === 'ArrowLeft') go(index.value - 1)
}

// Other devices of the table and the head judge's release change the state (M10-13).
useLiveUpdates(
  () => block.value?.event.id,
  async () => {
    if (offline.value || !block.value) return
    try {
      await loadState()
    } catch {
      // Shown again with the next change or reload.
    }
  },
)

onMounted(() => {
  installAutoSync()
  void load()
  window.addEventListener('keydown', onKey)
  window.addEventListener('online', load)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('online', load)
})
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-4 pb-28" data-testid="robot-check">
    <RouterLink
      :to="back"
      class="-mt-4 inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      data-testid="back-link"
    >
      <ArrowLeftIcon class="size-4" /> {{ t('judging.myGames') }}
    </RouterLink>

    <ErrorAlert :error="error" />
    <Alert v-if="offline" class="border-amber-300 bg-amber-50 text-amber-950">
      <CloudOffIcon />
      <AlertDescription>{{ t('judging.check.offline') }}</AlertDescription>
    </Alert>
    <Skeleton v-if="loading && !block" class="h-40 w-full" />

    <p
      v-else-if="!loading && !error && !block"
      class="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
      data-testid="no-check"
    >
      {{ t('judging.check.none') }}
    </p>

    <template v-if="block">
      <header>
        <p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {{ t('judging.check.title') }}
        </p>
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ block.round.name }} · {{ block.category.code }}
        </h1>
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <!-- M10-01: the table this check is at. -->
          <span
            v-if="block.table"
            class="inline-flex items-center gap-1 rounded-full border-2 border-foreground/70 px-3 py-0.5 text-sm font-semibold text-foreground"
            data-testid="check-table"
            >{{ block.table.name }}</span
          >
          {{ [when, block.event.name].filter(Boolean).join(' · ') }}
        </p>
      </header>

      <Alert
        v-if="done"
        class="border-emerald-300 bg-emerald-50 text-emerald-950"
        data-testid="check-done"
      >
        <CheckIcon />
        <AlertDescription class="flex flex-wrap items-center gap-x-3">
          <template v-if="scoringStarted">{{ t('judging.check.over') }}</template>
          <template v-else>
            {{
              state?.ready?.by
                ? t('checks.robot.readyBy', { name: state.ready.by.name })
                : t('judging.check.finished')
            }}
            <button
              v-if="state && !(state.round.check_mode === 'synchronous' && state.round.released_at)"
              type="button"
              class="font-medium underline"
              :disabled="busy || readOnly"
              @click="reopen"
            >
              {{ t('judging.check.reopen') }}
            </button>
          </template>
        </AlertDescription>
      </Alert>

      <ErrorAlert :error="actionError" />
      <!-- M10-16: the day's parts check comes first. -->
      <Alert
        v-if="state?.parts_check"
        class="border-amber-300 bg-amber-50 text-amber-950"
        data-testid="check-parts-open"
      >
        <LockIcon />
        <AlertDescription>{{
          t('checks.robot.partsOpen', { title: state.parts_check.title })
        }}</AlertDescription>
      </Alert>
      <!-- How the check leads to the run (M10-11, M10-12). -->
      <p
        v-if="state && state.round.check_mode !== 'off'"
        class="rounded-lg bg-muted px-3 py-2 text-sm"
        data-testid="check-mode"
      >
        <template v-if="state.round.check_mode === 'asynchronous'">{{
          t('checks.robot.asynchronous')
        }}</template>
        <template v-else-if="state.round.released_at">{{ t('checks.robot.released') }}</template>
        <template v-else>{{ t('checks.robot.synchronous') }}</template>
      </p>
      <RoundFilePanel v-if="state?.file" :round-id="roundId" :file="state.file" />

      <!-- All teams of the check; the current one is highlighted. -->
      <ol
        class="flex gap-2 overflow-x-auto pb-1"
        :aria-label="t('events.tabs.teams')"
        data-testid="check-teams"
      >
        <li v-for="(team, i) in teams" :key="team.id" class="shrink-0">
          <button
            type="button"
            class="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"
            :class="
              i === index ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted/60'
            "
            :aria-current="i === index ? 'step' : undefined"
            @click="go(i)"
          >
            <CheckIcon
              v-if="isChecked(team.id)"
              class="size-4 text-emerald-600"
              :aria-label="t('checks.robot.checked')"
            />
            <span class="font-bold tabular-nums">{{ team.sequence }}</span>
            <!-- M10-04: one line per chip; a long name scrolls instead of being cut off. -->
            <MarqueeText class="max-w-40" :text="team.name" />
            <span
              v-if="countFor(team.id)"
              class="rounded bg-muted px-1.5 text-xs text-muted-foreground"
              :class="{ 'bg-background/20 text-background': i === index }"
              >{{ countFor(team.id) }}</span
            >
          </button>
        </li>
      </ol>

      <section
        v-if="current"
        class="flex flex-col gap-4 rounded-2xl border-2 border-foreground/80 p-4"
        data-testid="check-current"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span
            class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-xl font-bold tabular-nums"
            >{{ current.sequence }}</span
          >
          <span class="min-w-0 flex-1">
            <span class="block text-2xl font-bold break-words hyphens-auto">{{
              current.name
            }}</span>
            <span class="block text-sm text-muted-foreground">{{
              t('judging.check.teamOf', { n: index + 1, total: teams.length })
            }}</span>
          </span>
          <Button as-child variant="outline" size="touch">
            <RouterLink
              :to="{
                name: 'judging-game',
                params: { id: current.game },
                query: { from: route.fullPath },
              }"
              ><PlayIcon /> {{ t('judging.dashboard.score') }}</RouterLink
            >
          </Button>
        </div>

        <!-- M10-10: the team's check, stored on the server. -->
        <div class="flex flex-wrap items-center gap-3">
          <Button
            size="touch"
            :variant="isChecked(current.id) ? 'outline' : 'default'"
            :class="isChecked(current.id) ? 'border-emerald-500 text-emerald-800' : ''"
            :disabled="
              locked ||
              readOnly ||
              (isChecked(current.id) && !!serverTeam(current.id)?.scoring_started)
            "
            :aria-pressed="isChecked(current.id)"
            data-testid="team-check"
            @click="toggleCheck(current.id)"
          >
            <template v-if="isChecked(current.id)"
              ><CheckIcon /> {{ t('checks.robot.checked') }}</template
            >
            <template v-else><CheckIcon /> {{ t('checks.robot.confirm') }}</template>
          </Button>
          <span
            v-if="isChecked(current.id)"
            class="text-sm text-muted-foreground"
            data-testid="team-checked-by"
          >
            <template v-if="queued[current.id] !== undefined">{{
              t('checks.robot.queued')
            }}</template>
            <template v-else>{{ checkedAt(current.id) }}</template>
            <Undo2Icon
              v-if="!serverTeam(current.id)?.scoring_started"
              class="ml-1 inline size-3.5"
              aria-hidden="true"
            />
          </span>
        </div>

        <ProgramNameField
          :key="current.game"
          :game-id="current.game"
          :model-value="current.program_name"
          mode="check"
          :editable="!offline && block.event.status !== 'archived'"
          @update:model-value="programSaved"
        />

        <ErrorAlert :error="documentsError" />
        <p
          v-if="!currentDocs.length && !documentsError && !offline"
          class="rounded-lg border border-dashed p-4 text-center text-muted-foreground"
          data-testid="no-documents"
        >
          {{ t('judging.check.noDocuments') }}
        </p>

        <article
          v-for="doc in currentDocs"
          :key="doc.id"
          class="flex flex-col gap-2 rounded-xl border p-3"
          :data-document="doc.title"
        >
          <div class="flex items-center gap-2">
            <component
              :is="documentKind(doc.file) === 'pdf' ? FileTextIcon : FileIcon"
              class="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 class="min-w-0 flex-1 truncate font-semibold">{{ doc.title }}</h2>
            <Button as-child size="icon-touch" variant="ghost">
              <a
                :href="documentUrl(doc, token)"
                target="_blank"
                rel="noopener"
                :aria-label="t('common.openItem', { item: doc.title })"
                ><ExternalLinkIcon
              /></a>
            </Button>
            <Button as-child size="icon-touch" variant="ghost">
              <a
                :href="documentUrl(doc, token, true)"
                :aria-label="t('common.downloadItem', { item: doc.title })"
                ><DownloadIcon
              /></a>
            </Button>
          </div>
          <template v-if="token">
            <img
              v-if="documentKind(doc.file) === 'image'"
              :src="documentUrl(doc, token)"
              :alt="doc.title"
              class="max-h-[70vh] w-full rounded-lg bg-muted object-contain"
            />
            <iframe
              v-else-if="documentKind(doc.file) === 'pdf'"
              :src="documentUrl(doc, token)"
              :title="doc.title"
              class="h-[70vh] w-full rounded-lg border bg-muted"
            />
          </template>
        </article>
      </section>

      <!-- Step navigation stays in reach on tablets. -->
      <nav
        class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur"
        :aria-label="t('judging.check.steps')"
      >
        <div class="mx-auto flex max-w-4xl items-center gap-3">
          <Button
            variant="outline"
            size="touch"
            :disabled="index === 0"
            data-testid="check-prev"
            @click="go(index - 1)"
          >
            <ChevronLeftIcon /> {{ t('judging.check.previous') }}
          </Button>
          <span class="flex-1 text-center text-sm text-muted-foreground tabular-nums"
            >{{ index + 1 }} / {{ teams.length }}</span
          >
          <Button
            v-if="index < teams.length - 1"
            size="touch"
            data-testid="check-next"
            @click="go(index + 1)"
          >
            {{ t('judging.check.next') }} <ChevronRightIcon />
          </Button>
          <Button
            v-else-if="!done"
            size="touch"
            data-testid="check-finish"
            :disabled="busy || locked || readOnly || offline"
            @click="finish"
          >
            <CheckIcon /> {{ t('checks.robot.ready') }}
          </Button>
          <Button v-else as-child variant="outline" size="touch">
            <RouterLink :to="back">{{ t('judging.myGames') }} <ChevronRightIcon /></RouterLink>
          </Button>
        </div>
      </nav>
    </template>
  </div>
</template>
