/// <reference path="../pb_data/types.d.ts" />

// API responses carry live competition data and must never be served from a
// browser or proxy cache (a cached list once hid a just-saved result).
routerUse((e) => {
  if (e.request.url.path.startsWith('/api/')) {
    e.response.header().set('Cache-Control', 'no-store')
  }
  return e.next()
})
