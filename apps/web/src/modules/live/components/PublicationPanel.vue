<script setup lang="ts">
import { t, localeTag } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ExternalLinkIcon, SendIcon, TvIcon } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listEventCategories } from '@/modules/categories/api'
import { createSnapshot } from '@/modules/rankings/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import type { CategoryRecord, EventRecord, RankingSnapshotRecord } from '@/shared/types/records'
import { listEventSnapshots, updatePublication } from '../api'

/**
 * Result publication per category (M6-10): managers decide whether the public sees the live
 * ranking and which ranking snapshot is the official one. Nothing is public by default.
 */
const props = defineProps<{ event: EventRecord; editable: boolean }>()

const categories = ref<CategoryRecord[]>([])
const snapshots = ref<RankingSnapshotRecord[]>([])
const loading = ref(true)
const loadError = ref<AppError>()

async function load() {
  loading.value = true
  try {
    const [c, s] = await Promise.all([
      listEventCategories(props.event.id),
      listEventSnapshots(props.event.id),
    ])
    categories.value = c
    snapshots.value = s
  } catch (e) {
    loadError.value = toAppError(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const snapshotsOf = (id: string) => snapshots.value.filter((s) => s.category === id)
const hasRanking = (c: CategoryRecord) => c.ranking !== null && c.ranking !== undefined
const isPublic = computed(() => props.event.status !== 'draft')

function replace(updated: CategoryRecord) {
  categories.value = categories.value.map((c) => (c.id === updated.id ? updated : c))
}

const save = useSubmit(
  async (category: CategoryRecord, data: { public_live?: boolean; published_snapshot?: string }) =>
    replace(await updatePublication(category.id, data)),
  { success: () => t('live.publication.updated') },
)

const publishNow = useSubmit(
  async (category: CategoryRecord) => {
    const title = `${t('live.publication.officialTitle')} · ${new Date().toLocaleString(
      localeTag(),
      { dateStyle: 'medium', timeStyle: 'short' },
    )}`
    const snapshot = await createSnapshot(category.id, title)
    snapshots.value = [snapshot, ...snapshots.value]
    replace(await updatePublication(category.id, { published_snapshot: snapshot.id }))
  },
  { success: () => t('live.publication.published') },
)

const pending = computed(() => save.pending.value || publishNow.pending.value)
const error = computed(() => save.error.value ?? publishNow.error.value)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="max-w-2xl text-sm text-muted-foreground">{{ t('live.publication.description') }}</p>
      <div class="flex gap-2">
        <Button as-child variant="outline">
          <RouterLink :to="{ name: 'live-event', params: { id: event.id } }"
            ><ExternalLinkIcon /> {{ t('live.publication.publicPage') }}</RouterLink
          >
        </Button>
        <Button as-child variant="outline">
          <RouterLink :to="{ name: 'live-tv', params: { id: event.id } }"
            ><TvIcon /> {{ t('live.tvMode') }}</RouterLink
          >
        </Button>
      </div>
    </div>
    <Alert v-if="!isPublic">
      <AlertDescription>{{ t('live.publication.draft') }}</AlertDescription>
    </Alert>
    <ErrorAlert :error="loadError ?? error" />
    <Skeleton v-if="loading" class="h-24 w-full" />
    <Table v-else data-testid="publication">
      <TableHeader>
        <TableRow>
          <TableHead>{{ t('teams.category') }}</TableHead>
          <TableHead>{{ t('live.publication.livePublic') }}</TableHead>
          <TableHead>{{ t('live.publication.official') }}</TableHead>
          <TableHead class="w-0"
            ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
          >
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="c in categories" :key="c.id" :data-category="c.name">
          <TableCell>
            <RouterLink
              :to="{ name: 'category-ranking', params: { id: c.id } }"
              class="font-medium hover:underline"
              >{{ c.name }}</RouterLink
            >
            <span class="block text-xs text-muted-foreground">{{ c.code }}</span>
          </TableCell>
          <TableCell>
            <label class="inline-flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="size-5 accent-foreground"
                :checked="!!c.public_live"
                :disabled="!editable || pending || !hasRanking(c)"
                :aria-label="t('live.publication.showLive', { category: c.name })"
                @change="save.run(c, { public_live: ($event.target as HTMLInputElement).checked })"
              />
              {{ c.public_live ? t('live.publication.public') : t('live.publication.hidden') }}
            </label>
            <span v-if="!hasRanking(c)" class="block text-xs text-muted-foreground">{{
              t('live.publication.configureFirst')
            }}</span>
          </TableCell>
          <TableCell class="whitespace-normal">
            <NativeSelect
              :model-value="c.published_snapshot ?? ''"
              :disabled="!editable || pending"
              :aria-label="t('live.publication.officialOf', { category: c.name })"
              class="max-w-xs"
              @update:model-value="save.run(c, { published_snapshot: String($event ?? '') })"
            >
              <NativeSelectOption value="">{{
                t('live.publication.notPublished')
              }}</NativeSelectOption>
              <NativeSelectOption v-for="s in snapshotsOf(c.id)" :key="s.id" :value="s.id">
                {{ s.title }} – {{ formatDateTime(s.created) }}
              </NativeSelectOption>
            </NativeSelect>
            <span
              v-if="c.published_snapshot && c.results_published_at"
              class="mt-1 block text-xs text-muted-foreground"
              data-testid="published-at"
              >{{
                t('live.publication.publishedAt', { date: formatDateTime(c.results_published_at) })
              }}</span
            >
          </TableCell>
          <TableCell>
            <Button
              v-if="editable"
              size="sm"
              :disabled="pending || !hasRanking(c)"
              @click="publishNow.run(c)"
            >
              <SendIcon /> {{ t('live.publication.publishNow') }}
            </Button>
          </TableCell>
        </TableRow>
        <TableEmpty v-if="!categories.length" :colspan="4">{{ t('categories.empty') }}</TableEmpty>
      </TableBody>
    </Table>
  </div>
</template>
