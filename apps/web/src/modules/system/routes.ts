import type { RouteRecordRaw } from 'vue-router'
import DashboardView from './views/DashboardView.vue'

export const systemRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: DashboardView },
  {
    path: '/status',
    name: 'status',
    component: () => import('./views/StatusView.vue'),
    meta: { public: true },
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('./views/ForbiddenView.vue'),
    meta: { public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./views/NotFoundView.vue'),
    meta: { public: true },
  },
]
