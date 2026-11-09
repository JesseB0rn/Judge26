<script setup lang="ts">
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
  success: 'Verification email sent.',
})

onMounted(() => {
  if (token) confirm.run()
})
</script>

<template>
  <AuthCard v-if="token" title="Email verification">
    <p v-if="confirm.pending.value" class="text-muted-foreground">Verifying…</p>
    <template v-else-if="confirmed">
      <p data-testid="verification-success">Your email address has been verified.</p>
      <Button as-child>
        <RouterLink :to="session.isAuthenticated ? '/' : '/login'">Continue</RouterLink>
      </Button>
    </template>
    <ErrorAlert v-else :error="confirm.error.value" />
  </AuthCard>

  <AuthCard
    v-else
    title="Verify your email"
    description="We sent you a link to confirm your email address."
  >
    <p class="text-sm text-muted-foreground">
      Open the link in the email to activate your account. Until then, you cannot access events or
      register teams.
    </p>
    <ErrorAlert :error="resend.error.value" />
    <div v-if="session.isAuthenticated" class="flex gap-2">
      <Button variant="outline" :disabled="resend.pending.value" @click="resend.run()">
        Resend email
      </Button>
      <Button variant="ghost" @click="session.refresh().catch(() => {})">I have verified</Button>
    </div>
  </AuthCard>
</template>
