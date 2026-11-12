import type { RouteRecordRaw } from 'vue-router'

export const templateRoutes: RouteRecordRaw[] = [
  {
    // M8-24: event template library.
    path: '/admin/templates',
    name: 'event-templates',
    component: () => import('./views/TemplateLibraryView.vue'),
    meta: { requiresAdmin: true },
  },
]
