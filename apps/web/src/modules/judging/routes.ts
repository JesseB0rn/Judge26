import type { RouteRecordRaw } from 'vue-router'

export const judgingRoutes: RouteRecordRaw[] = [
  {
    path: '/judging',
    name: 'judging',
    component: () => import('./views/JudgeDashboardView.vue'),
  },
  {
    // M10-07: a head judge chooses a table to judge at.
    path: '/judging/tables',
    name: 'judging-tables',
    component: () => import('./views/HeadJudgeTablesView.vue'),
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
