/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_ENV: 'development' | 'test' | 'production'
  readonly VITE_POCKETBASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
