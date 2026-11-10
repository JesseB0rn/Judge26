import type { RouteRecordRaw } from 'vue-router'

// Public pages (M6): no sign-in required.
export const liveRoutes: RouteRecordRaw[] = [
  {
    path: '/live',
    name: 'live',
    component: () => import('./views/LiveEventsView.vue'),
    meta: { public: true },
  },
  {
    path: '/live/:id',
    name: 'live-event',
    component: () => import('./views/LiveEventView.vue'),
    props: true,
    meta: { public: true },
  },
  {
    // Full-screen display without the application shell (M6-05, M6-T07).
    path: '/live/:id/tv',
    name: 'live-tv',
    component: () => import('./views/TvView.vue'),
    props: true,
    meta: { public: true, layout: 'bare' },
  },
]
