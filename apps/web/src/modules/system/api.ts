import { pb } from '@/shared/api/pocketbase'

export interface AppInfo {
  name: string
  environment: string
}

/** Fetches metadata from the custom `/api/app/info` hook. */
export function fetchAppInfo(): Promise<AppInfo> {
  return pb.send<AppInfo>('/api/app/info', { method: 'GET', requestKey: 'app-info' })
}
