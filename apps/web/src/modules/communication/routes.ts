import type { RouteRecordRaw } from 'vue-router'

export const communicationRoutes: RouteRecordRaw[] = [
  {
    path: '/admin/emails',
    name: 'emails',
    component: () => import('./views/EmailsView.vue'),
    meta: { requiresAdmin: true },
  },
]
