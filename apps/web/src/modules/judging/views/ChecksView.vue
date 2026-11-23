<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref, watch } from 'vue'
import {
  CheckIcon,
  CircleDashedIcon,
  LockIcon,
  RefreshCwIcon,
  ShuffleIcon,
  Trash2Icon,
  UnlockIcon,
  UploadIcon,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import { formatDay, formatTimeOfDay } from '@/shared/format'
import { listEvents } from '@/modules/events/api'
import { useLiveUpdates } from '@/modules/live/useLiveUpdates'
import {
  completePartsCheck,
  getEventChecks,
  releaseRound,
  removeRoundFile,
  reopenPartsCheck,
  setCheckMode,
  uploadRoundFile,
  withdrawRelease,
} from '../api'
import { timeRange } from '../lib'
import type { CheckMode, EventCheckProgress, PartsCheckProgress, RoundProgress } from '../types'
import ReasonDialog from '../components/ReasonDialog.vue'
import RoundFilePanel from '../components/RoundFilePanel.vue'

/**
 * Checks of an event for head judges (M10-13): each parts check with the tables that confirmed
 * it (M10-16), and each round's robot check per table — teams checked of total, ready state and
 * release (M10-11) — with the round's randomization file (M10-17). Updated live.
 */
const session = useSessionStore()
const adminEvents = ref<{ id: string; name: string }[]>([])
const events = computed(() => {
  const seen = new Map(session.reviewEvents.map((e) => [e.id, e.name]))
  for (const e of adminEvents.value) if (!seen.has(e.id)) seen.set(e.id, e.name)
  return [...seen].map(([id, name]) => ({ id, name }))
})
const { event: eventId } = useQueryRefs({ event: '' })

const data = ref<EventCheckProgress | null>(null)
const loading = ref(false)
const error = ref<AppError | null>(null)
const actionError = ref<AppError | null>(null)
const busy = ref('')

async function load() {
  if (!eventId.value) return
  loading.value = true
  error.value = null
  try {
    data.value = await getEventChecks(eventId.value)
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (session.isAdmin) {
    try {
      adminEvents.value = (await listEvents())
        .filter((e) => e.status !== 'archived')
        .map((e) => ({ id: e.id, name: e.name }))
    } catch (e) {
      error.value = toAppError(e)
    }
  }
  if (!events.value.some((e) => e.id === eventId.value)) eventId.value = events.value[0]?.id ?? ''
  await load()
})
watch(eventId, () => {
  data.value = null
  void load()
})
// Checks at the tables update this page without a reload (M10-T19).
useLiveUpdates(() => eventId.value || undefined, load)

const readOnly = computed(() => data.value?.event.status === 'archived')

async function act(key: string, action: () => Promise<unknown>) {
  busy.value = key
  actionError.value = null
  try {
    await action()
    await load()
    return true
  } catch (e) {
    actionError.value = toAppError(e)
    return false
  } finally {
    busy.value = ''
  }
}

function dayLabel(day: { date: string; label: string } | null) {
  return day ? day.label || formatDay(day.date) : t('judging.noDay')
}

// --- Parts checks (M10-16) ---

const openTables = (block: PartsCheckProgress) =>
  block.tables.filter((tb) => !tb.confirmed_at).map((tb) => tb.name)

async function complete(block: PartsCheckProgress) {
  const open = openTables(block)
  if (open.length && !confirm(t('checks.parts.confirmOpen', { tables: open.join(', ') }))) return
  await act(`parts:${block.id}`, () => completePartsCheck(block.id, open.length > 0))
}

// --- Robot checks (M10-09, M10-11) ---

const MODES: CheckMode[] = ['synchronous', 'asynchronous', 'off']

function notReady(round: RoundProgress) {
  return round.tables.filter((tb) => !tb.ready).map((tb) => tb.name)
}

const releasing = ref<RoundProgress | null>(null)
const releaseOpen = ref(false)

async function release(round: RoundProgress) {
  if (notReady(round).length) {
    releasing.value = round
    releaseOpen.value = true
    return
  }
  await act(`release:${round.id}`, () => releaseRound(round.id))
}

async function releaseWithReason(reason: string) {
  const round = releasing.value
  if (!round) return
  if (await act(`release:${round.id}`, () => releaseRound(round.id, reason))) {
    releaseOpen.value = false
  }
}

async function changeMode(round: RoundProgress, mode: CheckMode) {
  if (mode === round.check_mode) return
  await act(`mode:${round.id}`, () => setCheckMode(round.id, mode))
}

async function upload(round: RoundProgress, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await act(`file:${round.id}`, () => uploadRoundFile(round.id, file))
}

async function removeFile(round: RoundProgress) {
  if (!confirm(t('checks.file.confirmRemove'))) return
  await act(`file:${round.id}`, () => removeRoundFile(round.id))
}

const shownFile = ref('')
</script>

<template>
  <PageHeader :title="t('checks.title')" :description="t('checks.description')">
    <template #actions>
      <Button variant="outline" size="touch" :disabled="loading" @click="load">
        <RefreshCwIcon :class="{ 'animate-spin': loading }" /> {{ t('common.refresh') }}
      </Button>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-6" data-testid="checks-view">
    <label v-if="events.length > 1" class="flex max-w-md flex-col gap-1 text-sm font-medium">
      {{ t('events.event') }}
      <NativeSelect v-model="eventId" class="w-full">
        <NativeSelectOption v-for="e in events" :key="e.id" :value="e.id">{{
          e.name
        }}</NativeSelectOption>
      </NativeSelect>
    </label>
    <p
      v-if="!events.length"
      class="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
    >
      {{ t('judging.review.noEvents') }}
    </p>

    <ErrorAlert :error="error" />
    <ErrorAlert :error="actionError" />
    <Skeleton v-if="loading && !data" class="h-40 w-full" />

    <template v-if="data">
      <section v-if="data.parts_checks.length" class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">{{ t('checks.parts.title') }}</h2>
        <article
          v-for="block in data.parts_checks"
          :key="block.id"
          class="flex flex-col gap-3 rounded-xl border p-4"
          :data-parts-check="block.title"
        >
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold">{{ block.title }}</h3>
              <p class="text-sm text-muted-foreground">
                {{ dayLabel(block.day) }} · {{ timeRange(block.starts_at, block.duration_minutes)
                }}<template v-if="block.place"> · {{ block.place }}</template>
                <template v-if="block.blocks_first_round">
                  · {{ t('checks.parts.blocksFirstRound') }}</template
                >
              </p>
            </div>
            <template v-if="block.completed_at">
              <span
                class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900"
                data-testid="parts-completed"
              >
                <CheckIcon class="size-4" />
                {{
                  t('checks.parts.completedBy', {
                    name: block.completed_by?.name ?? '',
                    time: formatTimeOfDay(block.completed_at),
                  })
                }}
              </span>
              <Button
                variant="outline"
                size="touch"
                :disabled="readOnly || busy === `parts:${block.id}`"
                @click="act(`parts:${block.id}`, () => reopenPartsCheck(block.id))"
                >{{ t('checks.parts.reopen') }}</Button
              >
            </template>
            <Button
              v-else
              size="touch"
              :disabled="readOnly || busy === `parts:${block.id}`"
              data-testid="parts-complete"
              @click="complete(block)"
              ><CheckIcon /> {{ t('checks.parts.complete') }}</Button
            >
          </div>
          <ul class="flex flex-wrap gap-2">
            <li
              v-for="tb in block.tables"
              :key="tb.id"
              class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
              :class="tb.confirmed_at ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : ''"
              :data-table="tb.name"
              :data-confirmed="!!tb.confirmed_at"
            >
              <CheckIcon
                v-if="tb.confirmed_at"
                class="size-4"
                :aria-label="t('checks.confirmed')"
              />
              <CircleDashedIcon
                v-else
                class="size-4 text-muted-foreground"
                :aria-label="t('checks.open')"
              />
              {{ tb.name }}
            </li>
          </ul>
        </article>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">{{ t('checks.rounds') }}</h2>
        <p
          v-if="!data.rounds.length"
          class="rounded-xl border border-dashed p-6 text-center text-muted-foreground"
        >
          {{ t('checks.noRounds') }}
        </p>
        <article
          v-for="round in data.rounds"
          :key="round.id"
          class="flex flex-col gap-3 rounded-xl border p-4"
          :data-round="round.id"
        >
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold">{{ round.name }} · {{ round.category.code }}</h3>
              <p class="text-sm text-muted-foreground">{{ dayLabel(round.day) }}</p>
            </div>
            <label
              class="flex w-full flex-col items-start gap-1 text-sm sm:w-auto sm:flex-row sm:items-center sm:gap-2"
            >
              {{ t('checks.mode.label') }}
              <NativeSelect
                class="w-full sm:w-auto"
                :model-value="round.check_mode"
                :disabled="readOnly || round.checks_recorded || busy === `mode:${round.id}`"
                data-testid="check-mode-select"
                @update:model-value="changeMode(round, String($event) as CheckMode)"
              >
                <NativeSelectOption
                  v-for="mode in MODES.filter(
                    (m) => m !== 'off' || data?.can_manage || round.check_mode === 'off',
                  )"
                  :key="mode"
                  :value="mode"
                  >{{ t(`checks.mode.${mode}`) }}</NativeSelectOption
                >
              </NativeSelect>
            </label>
          </div>

          <p
            v-if="round.parts_check"
            class="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            <LockIcon class="size-4" />
            {{ t('checks.robot.partsOpen', { title: round.parts_check.title }) }}
          </p>

          <template v-if="round.check_mode !== 'off'">
            <table class="w-full text-sm">
              <thead class="text-left text-muted-foreground">
                <tr>
                  <th class="py-1 pr-3 font-medium">{{ t('teams.mine.table') }}</th>
                  <th class="py-1 pr-3 font-medium whitespace-nowrap">{{ t('checks.checked') }}</th>
                  <th class="py-1 font-medium">{{ t('checks.readyState') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="tb in round.tables"
                  :key="tb.id"
                  class="border-t"
                  :data-table="tb.name"
                  :data-ready="!!tb.ready"
                >
                  <td class="py-2 pr-3 font-medium break-words">{{ tb.name }}</td>
                  <td class="py-2 pr-3 tabular-nums whitespace-nowrap" data-testid="table-checked">
                    {{ t('checks.ofTotal', { done: tb.checked, total: tb.total }) }}
                  </td>
                  <td class="py-2">
                    <span
                      v-if="tb.ready"
                      class="inline-flex items-center gap-1 text-emerald-800"
                      data-testid="table-ready"
                      ><CheckIcon class="size-4" /> {{ t('checks.ready') }}
                      {{ formatTimeOfDay(tb.ready.at) }}</span
                    >
                    <span v-else class="text-muted-foreground">{{ t('checks.notReady') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div
              v-if="round.check_mode === 'synchronous'"
              class="flex flex-wrap items-center gap-3"
            >
              <template v-if="round.released_at">
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900"
                  data-testid="round-released"
                >
                  <UnlockIcon class="size-4" />
                  {{
                    t('checks.releasedBy', {
                      name: round.released_by?.name ?? '',
                      time: formatTimeOfDay(round.released_at),
                    })
                  }}
                </span>
                <span v-if="round.release_reason" class="text-sm text-muted-foreground">{{
                  round.release_reason
                }}</span>
                <Button
                  variant="outline"
                  size="touch"
                  :disabled="readOnly || busy === `release:${round.id}`"
                  @click="act(`release:${round.id}`, () => withdrawRelease(round.id))"
                  >{{ t('checks.withdraw') }}</Button
                >
              </template>
              <Button
                v-else
                size="touch"
                :disabled="readOnly || busy === `release:${round.id}`"
                data-testid="release-round"
                @click="release(round)"
                ><UnlockIcon /> {{ t('checks.release') }}</Button
              >
            </div>
          </template>

          <!-- M10-17: the randomization file, shown to judges once the check is confirmed. -->
          <div class="flex flex-wrap items-center gap-2 border-t pt-3">
            <ShuffleIcon class="size-4 text-muted-foreground" aria-hidden="true" />
            <span class="text-sm font-medium">{{ t('checks.file.title') }}:</span>
            <template v-if="round.file">
              <button
                type="button"
                class="text-sm underline"
                data-testid="round-file-name"
                @click="shownFile = shownFile === round.id ? '' : round.id"
              >
                {{ round.file.name }}
              </button>
              <Button
                variant="ghost"
                size="icon-touch"
                :disabled="readOnly || busy === `file:${round.id}`"
                :aria-label="t('checks.file.remove')"
                @click="removeFile(round)"
                ><Trash2Icon
              /></Button>
            </template>
            <span v-else class="text-sm text-muted-foreground">{{ t('checks.file.none') }}</span>
            <label
              v-if="!readOnly"
              class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              <UploadIcon class="size-4" />
              {{ round.file ? t('checks.file.replace') : t('checks.file.upload') }}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                class="sr-only"
                :disabled="busy === `file:${round.id}`"
                data-testid="round-file-input"
                @change="upload(round, $event)"
              />
            </label>
            <span class="w-full text-xs text-muted-foreground">{{ t('checks.file.hint') }}</span>
          </div>
          <RoundFilePanel
            v-if="round.file && shownFile === round.id"
            :round-id="round.id"
            :file="round.file"
          />
        </article>
      </section>
    </template>
  </div>

  <ReasonDialog
    v-model:open="releaseOpen"
    :title="t('checks.releaseAnyway')"
    :description="
      t('checks.notReadyTables', { tables: releasing ? notReady(releasing).join(', ') : '' })
    "
    :confirm-label="t('checks.release')"
    :busy="!!releasing && busy === `release:${releasing.id}`"
    :error="actionError"
    @confirm="releaseWithReason"
  />
</template>
