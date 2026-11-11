import { ClientResponseError } from 'pocketbase'
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

export type HealthStatus = 'ok' | 'degraded' | 'down'

/**
 * Overall health from the public `/api/app/health` hook (M7-13). The server answers 503 when it
 * is down; that is reported as "down" rather than an error.
 */
export async function fetchHealth(): Promise<HealthStatus> {
  try {
    const body = await pb.send<{ status: HealthStatus }>('/api/app/health', {
      method: 'GET',
      requestKey: 'app-health',
    })
    return body.status
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 503) return 'down'
    throw e
  }
}
