import type { RouteRecordRaw } from 'vue-router'

export const categoryRoutes: RouteRecordRaw[] = [
  {
    path: '/admin/categories',
    name: 'category-library',
    component: () => import('./views/CategoryLibraryView.vue'),
    meta: { requiresAdmin: true },
  },
]
