import type { RouteRecordRaw } from 'vue-router'

export const eventRoutes: RouteRecordRaw[] = [
  { path: '/events', name: 'events', component: () => import('./views/EventListView.vue') },
  {
    path: '/events/:id',
    name: 'event',
    component: () => import('./views/EventDetailView.vue'),
    props: true,
  },
  {
    // Schedule planner (M4-14): editor for managers, read-only schedule for everyone else.
    path: '/events/:id/planner',
    name: 'event-planner',
    component: () => import('@/modules/planner/views/PlannerView.vue'),
    props: true,
  },
  {
    // The assignment board (M8-E) lives in the Schedule tab; keep earlier links working.
    path: '/events/:id/board',
    redirect: (to) => ({ name: 'event', params: { id: to.params.id }, query: { tab: 'schedule' } }),
  },
]
