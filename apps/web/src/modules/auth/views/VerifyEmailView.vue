<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import AuthCard from '../components/AuthCard.vue'

const session = useSessionStore()
const route = useRoute()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const confirmed = ref(false)

const confirm = useSubmit(async () => {
  await session.confirmVerification(token)
  confirmed.value = true
})
const resend = useSubmit(() => session.requestVerification(), {
  success: () => t('auth.verify.resent'),
})

onMounted(() => {
  if (token) confirm.run()
})
</script>

<template>
  <AuthCard v-if="token" :title="t('auth.verify.confirmTitle')">
    <p v-if="confirm.pending.value" class="text-muted-foreground">
      {{ t('auth.verify.verifying') }}
    </p>
    <template v-else-if="confirmed">
      <p data-testid="verification-success">{{ t('auth.verify.success') }}</p>
      <Button as-child>
        <RouterLink :to="session.isAuthenticated ? '/' : '/login'">{{
          t('common.continue')
        }}</RouterLink>
      </Button>
    </template>
    <ErrorAlert v-else :error="confirm.error.value" />
  </AuthCard>

  <AuthCard v-else :title="t('auth.verify.title')" :description="t('auth.verify.description')">
    <p class="text-sm text-muted-foreground">{{ t('auth.verify.explanation') }}</p>
    <ErrorAlert :error="resend.error.value" />
    <div v-if="session.isAuthenticated" class="flex gap-2">
      <Button variant="outline" :disabled="resend.pending.value" @click="resend.run()">
        {{ t('auth.verify.resend') }}
      </Button>
      <Button variant="ghost" @click="session.refresh().catch(() => {})">{{
        t('auth.verify.done')
      }}</Button>
    </div>
  </AuthCard>
</template>
