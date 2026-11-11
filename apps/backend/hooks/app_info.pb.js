/// <reference path="../pb_data/types.d.ts" />

// Public endpoint exposing basic application metadata. Used by the frontend
// to show backend status, by tests to verify that hooks are loaded, and after a deployment to
// verify which build runs (M7-14; APP_VERSION and GIT_COMMIT are set by the Docker image).
routerAdd('GET', '/api/app/info', (e) => {
  return e.json(200, {
    name: 'judge26',
    environment: $os.getenv('PB_ENV') || 'production',
    version: $os.getenv('APP_VERSION') || 'dev',
    commit: $os.getenv('GIT_COMMIT') || 'unknown',
  })
})
