import type { RouteRecordRaw } from 'vue-router'

export const eventRoutes: RouteRecordRaw[] = [
  { path: '/events', name: 'events', component: () => import('./views/EventListView.vue') },
  {
    path: '/events/:id',
    name: 'event',
    component: () => import('./views/EventDetailView.vue'),
    props: true,
  },
]
