<script setup lang="ts">
import { t, translatedLabels } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { ChevronDownIcon, ChevronRightIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/format'
import type { AuditLogRecord } from '@/shared/types/records'
import { listAuditLog } from '../api'

/** Audit log (M7-08): who did what and when, newest first, with the changed fields. */
const props = defineProps<{ eventId?: string }>()

const AREA_KEYS = [
  'events',
  'competition_days',
  'categories',
  'teams',
  'team_documents',
  'role_assignments',
  'game_rules',
  'rulesets',
  'rounds',
  'round_phases',
  'schedule_blocks',
  'schedule_columns',
  'tables',
  'games',
  'ranking_snapshots',
  'mail_templates',
  'mail_outbox',
] as const
const AREAS: Readonly<Record<string, string>> = translatedLabels(AREA_KEYS, (area) =>
  t(`administration.audit.areas.${area}`),
)

const entries = ref<AuditLogRecord[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref<AppError>()
const area = ref('')
const search = ref('')
const open = ref(new Set<string>())

async function load(more = false) {
  loading.value = true
  error.value = undefined
  try {
    const next = more ? page.value + 1 : 1
    const result = await listAuditLog({
      event: props.eventId,
      collection: area.value,
      search: search.value.trim(),
      page: next,
    })
    entries.value = more ? [...entries.value, ...result.items] : result.items
    total.value = result.totalItems
    page.value = next
  } catch (e) {
    error.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}

const show = (value: unknown) =>
  value === null || value === undefined || value === '' ? '–' : String(value)

/** Rows of the changes: [field, before, after] for updates, [field, value] otherwise. */
function changeRows(entry: AuditLogRecord): string[][] {
  return Object.entries(entry.changes ?? {}).map(([field, value]) =>
    Array.isArray(value) && value.length === 2
      ? [field, show(value[0]), show(value[1])]
      : [field, show(value)],
  )
}
const more = computed(() => entries.value.length < total.value)

onMounted(() => load())
watchDebounced([area, search], () => load(), { debounce: 300 })
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <NativeSelect v-model="area" :aria-label="t('administration.audit.filterArea')" class="w-48">
        <NativeSelectOption value="">{{ t('administration.audit.allAreas') }}</NativeSelectOption>
        <NativeSelectOption v-for="(label, key) in AREAS" :key="key" :value="key">{{
          label
        }}</NativeSelectOption>
      </NativeSelect>
      <Input
        v-model="search"
        type="search"
        :placeholder="t('administration.audit.searchPlaceholder')"
        :aria-label="t('administration.audit.search')"
        class="max-w-xs"
      />
      <span class="text-sm text-muted-foreground">{{
        t('administration.audit.entries', total)
      }}</span>
    </div>
    <ErrorAlert :error="error" />
    <Table data-testid="audit-log">
      <TableHeader>
        <TableRow>
          <TableHead class="w-0"
            ><span class="sr-only">{{ t('events.detail.details') }}</span></TableHead
          >
          <TableHead>{{ t('teams.mine.when') }}</TableHead>
          <TableHead>{{ t('administration.audit.who') }}</TableHead>
          <TableHead>{{ t('administration.audit.what') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-for="entry in entries" :key="entry.id">
          <TableRow :data-action="entry.action">
            <TableCell>
              <Button
                v-if="entry.changes && Object.keys(entry.changes).length"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('administration.audit.detailsOf', { entry: entry.summary })"
                :aria-expanded="open.has(entry.id)"
                @click="toggle(entry.id)"
              >
                <ChevronDownIcon v-if="open.has(entry.id)" />
                <ChevronRightIcon v-else />
              </Button>
            </TableCell>
            <TableCell class="whitespace-nowrap">{{ formatDateTime(entry.created) }}</TableCell>
            <TableCell>
              {{ entry.actor_label }}
              <span v-if="entry.ip" class="block text-xs text-muted-foreground">{{
                entry.ip
              }}</span>
            </TableCell>
            <TableCell class="whitespace-normal">
              {{ entry.summary }}
              <span class="block text-xs text-muted-foreground"
                >{{ AREAS[entry.collection] ?? entry.collection }} · {{ entry.action }}</span
              >
            </TableCell>
          </TableRow>
          <TableRow v-if="open.has(entry.id)" :data-testid="`changes-${entry.id}`">
            <TableCell />
            <TableCell colspan="3" class="whitespace-normal">
              <table class="text-xs">
                <tbody>
                  <tr v-for="row in changeRows(entry)" :key="row[0]">
                    <th class="pr-3 text-left font-medium">{{ row[0] }}</th>
                    <td class="pr-3 break-all">{{ row[1] }}</td>
                    <td v-if="row.length === 3" class="break-all">→ {{ row[2] }}</td>
                  </tr>
                </tbody>
              </table>
            </TableCell>
          </TableRow>
        </template>
        <TableEmpty v-if="!loading && !entries.length" :colspan="4">{{
          t('administration.audit.empty')
        }}</TableEmpty>
      </TableBody>
    </Table>
    <Button
      v-if="more"
      variant="outline"
      class="self-start"
      :disabled="loading"
      @click="load(true)"
    >
      {{ t('common.loadMore') }}
    </Button>
  </div>
</template>
