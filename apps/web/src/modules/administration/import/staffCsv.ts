import { t } from '@/i18n'
import Papa from 'papaparse'
import type { Role } from '@/shared/types/records'
import type { InviteInput } from '../invitations'

/**
 * Staff CSV (M8-06). Header row required, order and case free:
 *   name*, email*, role   (role: judge or head_judge; empty = judge)
 *
 * The file is only parsed here; every row is validated and classified (new, existing, invalid,
 * duplicate) by the server's preview, which knows the existing accounts.
 */

export const REQUIRED_COLUMNS = ['name', 'email'] as const
export const MAX_ROWS = 500

const ROLE_ALIASES: Record<string, Role> = {
  judge: 'judge',
  head_judge: 'head_judge',
  'head judge': 'head_judge',
  headjudge: 'head_judge',
  event_manager: 'event_manager',
  'event manager': 'event_manager',
}

export interface StaffCsvResult {
  fileErrors: string[]
  rows: InviteInput[]
}

export function parseStaffCsv(text: string): StaffCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => v.trim(),
  })
  const columns = parsed.meta.fields ?? []
  const fileErrors: string[] = []
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c))
  if (missing.length) {
    fileErrors.push(t('administration.invite.missingColumns', { columns: missing.join(', ') }))
  }
  if (parsed.data.length === 0) fileErrors.push(t('administration.invite.noRows'))
  if (parsed.data.length > MAX_ROWS) {
    fileErrors.push(t('administration.invite.tooManyRows', { max: MAX_ROWS }))
  }
  if (fileErrors.length) return { fileErrors, rows: [] }
  return {
    fileErrors,
    rows: parsed.data.map((record, index) => {
      const role = (record.role ?? '').toLowerCase()
      return {
        line: index + 2,
        name: record.name ?? '',
        email: record.email ?? '',
        // Unknown roles are sent as they are, so the preview reports them.
        role: (role ? (ROLE_ALIASES[role] ?? role) : 'judge') as Role,
      }
    }),
  }
}

/** Example file offered for download in the import dialog. */
export const TEMPLATE_CSV = [
  'name,email,role',
  'Jo Judge,jo@example.com,judge',
  'Hana Head-Judge,hana@example.com,head_judge',
].join('\n')
