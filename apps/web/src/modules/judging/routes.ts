import type { RouteRecordRaw } from 'vue-router'

export const judgingRoutes: RouteRecordRaw[] = [
  {
    path: '/judging',
    name: 'judging',
    component: () => import('./views/JudgeDashboardView.vue'),
  },
  {
    path: '/judging/games/:id',
    name: 'judging-game',
    component: () => import('./views/ScoreGameView.vue'),
    props: true,
  },
]
