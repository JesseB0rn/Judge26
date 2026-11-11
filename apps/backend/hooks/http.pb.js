/// <reference path="../pb_data/types.d.ts" />

// API responses carry live competition data and must never be served from a
// browser or proxy cache (a cached list once hid a just-saved result).
routerUse((e) => {
  if (e.request.url.path.startsWith('/api/')) {
    e.response.header().set('Cache-Control', 'no-store')
  }
  return e.next()
})

// Unknown API paths are 404 errors. Without this, the SPA's index fallback (--publicDir in the
// Docker image) answered every unknown GET /api/... with index.html and status 200.
// Specific routes (built-in and custom) take precedence over this pattern.
routerAdd('GET', '/api/{path...}', () => {
  throw new NotFoundError("The requested resource wasn't found.")
})
