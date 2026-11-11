import type { RouteRecordRaw } from 'vue-router'

export const administrationRoutes: RouteRecordRaw[] = [
  {
    path: '/admin/users',
    name: 'users',
    component: () => import('./views/UsersView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/audit',
    name: 'audit-log',
    component: () => import('./views/AuditLogView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/monitoring',
    name: 'monitoring',
    component: () => import('./views/MonitoringView.vue'),
    meta: { requiresAdmin: true },
  },
]
