import { createRouter, createWebHistory } from 'vue-router'
import { isLocale, locale } from '@/i18n'
import { authRoutes } from '@/modules/auth/routes'
import { administrationRoutes } from '@/modules/administration/routes'
import { communicationRoutes } from '@/modules/communication/routes'
import { categoryRoutes } from '@/modules/categories/routes'
import { eventRoutes } from '@/modules/events/routes'
import { scoringRoutes } from '@/modules/scoring/routes'
import { rankingRoutes } from '@/modules/rankings/routes'
import { judgingRoutes } from '@/modules/judging/routes'
import { liveRoutes } from '@/modules/live/routes'
import { systemRoutes } from '@/modules/system/routes'
import { teamRoutes } from '@/modules/teams/routes'
import { useSessionStore } from '@/shared/auth/session'
import { resolveAccess } from './guards'

export const routes = [
  ...authRoutes,
  ...eventRoutes,
  ...categoryRoutes,
  ...scoringRoutes,
  ...rankingRoutes,
  ...judgingRoutes,
  ...liveRoutes,
  ...teamRoutes,
  ...administrationRoutes,
  ...communicationRoutes,
  // Contains the catch-all route and must stay last.
  ...systemRoutes,
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.ensureInitialized()
  // `?lang=fr` picks the language, e.g. for a shared TV display link (docs/specifications/i18n.md).
  const lang = to.query.lang
  if (isLocale(lang) && lang !== locale.value) void session.setLanguage(lang)
  return resolveAccess(to, session)
})

export default router
