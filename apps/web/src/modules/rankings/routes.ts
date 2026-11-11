import type { RouteRecordRaw } from 'vue-router'

export const rankingRoutes: RouteRecordRaw[] = [
  {
    path: '/categories/:id/ranking',
    name: 'category-ranking',
    component: () => import('./views/RankingView.vue'),
    props: true,
  },
  {
    // Printable report (M7-07): no application shell, so it prints as a clean page.
    path: '/categories/:id/ranking/report',
    name: 'category-ranking-report',
    component: () => import('./views/RankingReportView.vue'),
    props: (route) => ({
      id: route.params.id,
      snapshot: typeof route.query.snapshot === 'string' ? route.query.snapshot : undefined,
    }),
    meta: { layout: 'bare' },
  },
]
