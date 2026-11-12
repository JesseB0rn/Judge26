<script setup lang="ts">
import { t } from '@/i18n'
import { useRouter } from 'vue-router'
import { EyeIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/shared/auth/session'
import { formatDateTime } from '@/shared/format'
import { ROLE_LABELS } from '@/shared/types/records'

/** Shown while an admin views the app as another role (M8-15), with the way back. */
const session = useSessionStore()
const router = useRouter()

async function exit() {
  const event = session.viewAs?.event.id
  await session.stopViewAs()
  await router.push(
    session.isAuthenticated && event ? { name: 'event', params: { id: event } } : { name: 'login' },
  )
}

defineExpose({ exit })
</script>

<template>
  <div
    v-if="session.viewAs"
    class="border-b border-amber-300 bg-amber-100 text-amber-950 print:hidden dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    role="status"
    data-testid="view-as-banner"
  >
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      <EyeIcon class="size-4 shrink-0" aria-hidden="true" />
      <span class="font-medium">
        {{
          session.viewAs.persona
            ? t('shell.viewAs.bannerPerson', {
                name: session.viewAs.persona.name || session.viewAs.persona.email,
                role: ROLE_LABELS[session.viewAs.role],
                event: session.viewAs.event.name,
              })
            : t('shell.viewAs.banner', {
                role: ROLE_LABELS[session.viewAs.role],
                event: session.viewAs.event.name,
              })
        }}
      </span>
      <span v-if="session.viewAs.read_only" class="text-xs">{{ t('shell.viewAs.readOnly') }}</span>
      <span class="text-xs opacity-80">{{
        t('shell.viewAs.until', { date: formatDateTime(session.viewAs.expires_at) })
      }}</span>
      <Button
        size="sm"
        variant="outline"
        class="ml-auto h-7 border-amber-400 bg-transparent"
        data-testid="view-as-exit"
        :title="t('shell.viewAs.hotkey')"
        @click="exit"
        >{{ t('shell.viewAs.exit') }}</Button
      >
    </div>
  </div>
</template>
