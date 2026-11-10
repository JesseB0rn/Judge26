<script setup lang="ts">
import type { RulesetDefinition, ScoringNode } from '@judge26/scoring-engine'
import { formatDateTime } from '@/shared/format'
import { formatTime } from '../lib'
import type { AuditEntry, ScoreSnapshot } from '../types'

/** Audit trail of a game's score (M5-13): who changed what, when and why. */
const props = defineProps<{ entries: AuditEntry[]; definition?: RulesetDefinition | null }>()

const ACTIONS: Record<AuditEntry['action'], string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Returned to judge',
  corrected: 'Corrected',
  manual_edit: 'Result edited',
}

function labels(): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (node: ScoringNode) => {
    map.set(node.id, node.label)
    if (node.type === 'group') node.children.forEach(walk)
  }
  if (props.definition) walk(props.definition.root)
  return map
}

const show = (v: unknown) =>
  v === undefined || v === null ? '–' : v === true ? 'yes' : v === false ? 'no' : String(v)
const points = (s: ScoreSnapshot | null) =>
  !s ? '–' : s.outcome !== 'completed' ? s.outcome : String(s.points ?? '–')
const time = (s: ScoreSnapshot | null) => (s && s.time_ms > 0 ? formatTime(s.time_ms) : '–')

/** Criteria whose value differs between before and after. */
function changes(entry: AuditEntry) {
  if (!entry.before || !entry.after) return []
  const names = labels()
  const before = entry.before.values ?? {}
  const after = entry.after.values ?? {}
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      key,
      label: names.get(key) ?? key,
      from: show(before[key]),
      to: show(after[key]),
    }))
}

const changed = (entry: AuditEntry) =>
  !!entry.before &&
  !!entry.after &&
  (points(entry.before) !== points(entry.after) || time(entry.before) !== time(entry.after))
</script>

<template>
  <ol class="flex flex-col gap-3" data-testid="score-history">
    <li v-for="entry in entries" :key="entry.id" class="rounded-lg border p-3 text-sm">
      <div class="flex flex-wrap items-baseline gap-x-2">
        <span class="font-semibold">{{ ACTIONS[entry.action] }}</span>
        <span class="text-muted-foreground"
          >{{ entry.actor.name || 'System' }} · {{ formatDateTime(entry.created) }}</span
        >
      </div>
      <p v-if="entry.reason" class="mt-1">“{{ entry.reason }}”</p>
      <p v-if="changed(entry)" class="mt-1 tabular-nums" data-testid="history-change">
        Points {{ points(entry.before) }} → <strong>{{ points(entry.after) }}</strong> · Time
        {{ time(entry.before) }} → <strong>{{ time(entry.after) }}</strong>
      </p>
      <p v-else-if="entry.after && entry.action === 'submitted'" class="mt-1 tabular-nums">
        Points {{ points(entry.after) }} · Time {{ time(entry.after) }}
      </p>
      <ul v-if="changes(entry).length" class="mt-1 list-disc pl-5 text-muted-foreground">
        <li v-for="c in changes(entry)" :key="c.key">{{ c.label }}: {{ c.from }} → {{ c.to }}</li>
      </ul>
    </li>
    <li v-if="!entries.length" class="text-sm text-muted-foreground">No changes yet.</li>
  </ol>
</template>
