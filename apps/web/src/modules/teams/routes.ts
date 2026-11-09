import type { RouteRecordRaw } from 'vue-router'

export const teamRoutes: RouteRecordRaw[] = [
  { path: '/teams', name: 'my-teams', component: () => import('./views/MyTeamsView.vue') },
  {
    path: '/teams/:id',
    name: 'team',
    component: () => import('./views/TeamFormView.vue'),
    props: true,
  },
  {
    path: '/events/:eventId/teams/new',
    name: 'team-new',
    component: () => import('./views/TeamFormView.vue'),
    props: true,
  },
]
