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
  PlayIcon,
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
import { listAssignments } from '../api'
import { cachedAssignments, finishedChecks, setCheckFinished } from '../drafts'
import { isCheckDone, robotChecks, timeRange, type RobotCheckBlock } from '../lib'
import type { Assignment } from '../types'

/**
 * Guided robot check (M5-15): steps through the teams of one round at the judge's table in
 * playing order and shows each team's documents (M1-13). The current team is in the URL.
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
const userId = () => session.user?.id ?? ''
// Done once finished on this device or once scoring of the round has started at this table.
const done = computed(() => !!block.value && isCheckDone(block.value, rows.value, finished.value))
const scoringStarted = computed(() => !!block.value && isCheckDone(block.value, rows.value, []))

/** Marks the check as done (shown on the dashboard, "Up next" moves on) and returns. */
async function finish() {
  if (!block.value) return
  setCheckFinished(userId(), block.value.key, true)
  await router.push(back.value)
}

function reopen() {
  if (!block.value) return
  setCheckFinished(userId(), block.value.key, false)
  finished.value = finishedChecks(userId())
}

const { team: teamId } = useQueryRefs({ team: '' })
const tableId = computed(() =>
  typeof route.query.table === 'string' ? route.query.table : undefined,
)

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

function go(to: number) {
  const team = teams.value[Math.max(0, Math.min(teams.value.length - 1, to))]
  if (team) teamId.value = team.id
}

function findBlock(rows: Parameters<typeof robotChecks>[0]) {
  return robotChecks(rows).find(
    (b) =>
      b.round.id === props.roundId &&
      (tableId.value === undefined || b.table?.id === tableId.value),
  )
}

async function load() {
  loading.value = true
  error.value = null
  finished.value = finishedChecks(userId())
  try {
    let loaded
    try {
      loaded = await listAssignments()
      offline.value = false
    } catch (e) {
      const err = toAppError(e)
      loaded = err.kind === 'network' ? cachedAssignments(userId()) : null
      if (!loaded) throw e
      offline.value = true
    }
    rows.value = loaded
    block.value = findBlock(loaded)
    if (!block.value) return
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

onMounted(() => {
  void load()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
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
        <p class="text-muted-foreground">
          {{ [when, block.table?.name, block.event.name].filter(Boolean).join(' · ') }}
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
            {{ t('judging.check.finished') }}
            <button type="button" class="font-medium underline" @click="reopen">
              {{ t('judging.check.reopen') }}
            </button>
          </template>
        </AlertDescription>
      </Alert>

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
            <span class="font-bold tabular-nums">{{ team.sequence }}</span>
            <span class="max-w-40 truncate">{{ team.name }}</span>
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
            <span class="block truncate text-2xl font-bold">{{ current.name }}</span>
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
          <Button v-else-if="!done" size="touch" data-testid="check-finish" @click="finish">
            <CheckIcon /> {{ t('judging.check.finish') }}
          </Button>
          <Button v-else as-child variant="outline" size="touch">
            <RouterLink :to="back">{{ t('judging.myGames') }} <ChevronRightIcon /></RouterLink>
          </Button>
        </div>
      </nav>
    </template>
  </div>
</template>
