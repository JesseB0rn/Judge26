import PocketBase from 'pocketbase'
import { config } from '@/shared/config/env'

/** Shared PocketBase client. Auth state is persisted in localStorage by the SDK. */
export const pb = new PocketBase(config.pocketbaseUrl)
