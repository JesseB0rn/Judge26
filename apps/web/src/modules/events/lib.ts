import { t, translatedLabels } from '@/i18n'
import type { EventStatus } from '@/shared/types/records'

export const EVENT_STATUS_LABELS = translatedLabels<EventStatus>(
  ['draft', 'published', 'archived'],
  (status) => t(`events.status.${status}`),
)
