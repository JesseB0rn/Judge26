import type { RouteRecordRaw } from 'vue-router'

export const rankingRoutes: RouteRecordRaw[] = [
  {
    path: '/categories/:id/ranking',
    name: 'category-ranking',
    component: () => import('./views/RankingView.vue'),
    props: true,
  },
]
