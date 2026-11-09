import type { RouteRecordRaw } from 'vue-router'
import HomeView from './views/HomeView.vue'

export const systemRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./views/NotFoundView.vue'),
  },
]
