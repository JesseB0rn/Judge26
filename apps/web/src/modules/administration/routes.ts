import type { RouteRecordRaw } from 'vue-router'

export const administrationRoutes: RouteRecordRaw[] = [
  {
    path: '/admin/users',
    name: 'users',
    component: () => import('./views/UsersView.vue'),
    meta: { requiresAdmin: true },
  },
]
