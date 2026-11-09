export interface AppConfig {
  appName: string
  environment: ImportMetaEnv['VITE_APP_ENV']
  pocketbaseUrl: string
}

function required(name: keyof ImportMetaEnv, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

export const config: AppConfig = {
  appName: import.meta.env.VITE_APP_NAME ?? 'Judge26',
  environment: import.meta.env.VITE_APP_ENV ?? 'development',
  pocketbaseUrl: required('VITE_POCKETBASE_URL', import.meta.env.VITE_POCKETBASE_URL),
}
