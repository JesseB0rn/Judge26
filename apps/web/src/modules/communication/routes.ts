import type { RouteRecordRaw } from 'vue-router'

export const communicationRoutes: RouteRecordRaw[] = [
  {
    path: '/admin/emails',
    name: 'emails',
    component: () => import('./views/EmailsView.vue'),
    meta: { requiresAdmin: true },
  },
  // M8-11: captured emails, development and test builds only. The literal check lets the
  // production build drop the page entirely.
  ...(import.meta.env.VITE_APP_ENV !== 'production'
    ? [
        {
          path: '/dev/mailbox',
          name: 'dev-mailbox',
          component: () => import('./views/DevMailboxView.vue'),
          meta: { requiresAdmin: true },
        },
      ]
    : []),
]
