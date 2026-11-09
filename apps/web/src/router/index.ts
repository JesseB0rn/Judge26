import { createRouter, createWebHistory } from 'vue-router'
import { systemRoutes } from '@/modules/system/routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // Feature modules register their routes here. The system module contains the
  // catch-all route and must stay last.
  routes: [...systemRoutes],
})

export default router
