import type { RouteRecordRaw } from 'vue-router'

export const judgingRoutes: RouteRecordRaw[] = [
  {
    path: '/judging',
    name: 'judging',
    component: () => import('./views/JudgeDashboardView.vue'),
  },
  {
    path: '/review',
    name: 'review',
    component: () => import('./views/ReviewView.vue'),
  },
  {
    path: '/judging/rounds/:roundId/check',
    name: 'judging-check',
    component: () => import('./views/RobotCheckView.vue'),
    props: true,
  },
  {
    path: '/judging/games/:id',
    name: 'judging-game',
    component: () => import('./views/ScoreGameView.vue'),
    props: true,
  },
]
