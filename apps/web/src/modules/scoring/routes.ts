import type { RouteRecordRaw } from 'vue-router'

export const scoringRoutes: RouteRecordRaw[] = [
  {
    path: '/categories/:id/scoring',
    name: 'category-scoring',
    component: () => import('./views/RulesetsView.vue'),
    props: true,
  },
]
