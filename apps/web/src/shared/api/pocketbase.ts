import PocketBase from 'pocketbase'
import { config } from '@/shared/config/env'

/** Shared PocketBase client. Auth state is persisted in localStorage by the SDK. */
export const pb = new PocketBase(config.pocketbaseUrl)

// Several components may load the same collection at once; the SDK's default
// auto-cancellation of duplicate requests would abort all but the last one.
pb.autoCancellation(false)
