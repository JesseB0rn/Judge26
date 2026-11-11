import { pb } from '@/shared/api/pocketbase'

export interface AppInfo {
  name: string
  environment: string
  /** Build of the running server (M7-14); "dev" / "unknown" outside the Docker image. */
  version?: string
  commit?: string
}

/** Fetches metadata from the custom `/api/app/info` hook. */
export function fetchAppInfo(): Promise<AppInfo> {
  return pb.send<AppInfo>('/api/app/info', { method: 'GET', requestKey: 'app-info' })
}
