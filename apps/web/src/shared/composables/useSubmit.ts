import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { toAppError, type AppError } from '@/shared/api/errors'

/**
 * Wraps an async action with pending/error state. API errors are normalized to
 * `AppError`; field-level validation errors are exposed as `fieldErrors`.
 */
export function useSubmit<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  options: { success?: string } = {},
) {
  const pending = ref(false)
  const error = ref<AppError | null>(null)
  const fieldErrors = computed(() => error.value?.fieldErrors ?? {})

  async function run(...args: A): Promise<R | undefined> {
    pending.value = true
    error.value = null
    try {
      const result = await action(...args)
      if (options.success) toast.success(options.success)
      return result
    } catch (e) {
      error.value = toAppError(e)
      return undefined
    } finally {
      pending.value = false
    }
  }

  function reset() {
    error.value = null
  }

  return { run, pending, error, fieldErrors, reset }
}

/** Loads data on demand with loading/error state. */
export function useLoader<T>(loader: () => Promise<T>) {
  const data = ref<T>()
  const loading = ref(false)
  const error = ref<AppError | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      data.value = await loader()
    } catch (e) {
      error.value = toAppError(e)
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, load }
}
