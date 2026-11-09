/// <reference path="../pb_data/types.d.ts" />

// Public endpoint exposing basic application metadata. Used by the frontend
// to show backend status and by tests to verify that hooks are loaded.
routerAdd('GET', '/api/app/info', (e) => {
  return e.json(200, {
    name: 'judge26',
    environment: $os.getenv('PB_ENV') || 'production',
  })
})
