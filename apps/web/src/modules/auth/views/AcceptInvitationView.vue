<script setup lang="ts">
import { t } from '@/i18n'
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  acceptInvitation,
  lookupInvitation,
  type InvitationLookup,
} from '@/modules/administration/invitations'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { roleHome } from '@/shared/auth/viewAs'
import { useSubmit } from '@/shared/composables/useSubmit'
import { ROLE_LABELS } from '@/shared/types/records'
import AuthCard from '../components/AuthCard.vue'

/**
 * Invitation link (M8-10): the invited person chooses a password, which activates the account,
 * and lands signed in on the page where their role works.
 */
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const invitation = ref<InvitationLookup>()
const loadError = ref<AppError>()
const password = ref('')
const passwordConfirm = ref('')

const { run, pending, error, fieldErrors } = useSubmit(async () => {
  const accepted = await acceptInvitation(token, password.value, passwordConfirm.value)
  session.logout()
  await session.login(accepted.email, password.value)
  await router.replace(roleHome(accepted.role, accepted.event))
})

onMounted(async () => {
  if (!token) {
    invitation.value = { status: 'invalid' }
    return
  }
  try {
    invitation.value = await lookupInvitation(token)
  } catch (e) {
    loadError.value = toAppError(e)
  }
})
</script>

<template>
  <AuthCard :title="t('auth.invitation.title')">
    <ErrorAlert :error="loadError" />
    <Skeleton v-if="!invitation && !loadError" class="h-24 w-full" />
    <template v-else-if="invitation?.status === 'invited'">
      <p data-testid="invitation-details">
        {{
          t('auth.invitation.welcome', {
            name: invitation.name,
            event: invitation.event.name,
            role: ROLE_LABELS[invitation.role],
          })
        }}
      </p>
      <form class="flex flex-col gap-4" @submit.prevent="run()">
        <ErrorAlert :error="error" />
        <FormField v-slot="{ id }" :label="t('auth.email')" name="email">
          <Input
            :id="id"
            :model-value="invitation.email"
            type="email"
            readonly
            autocomplete="username"
          />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('auth.invitation.password')"
          name="password"
          :errors="fieldErrors"
          :description="t('auth.passwordHint')"
        >
          <Input
            :id="id"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('auth.invitation.passwordConfirm')"
          name="passwordConfirm"
          :errors="fieldErrors"
        >
          <Input
            :id="id"
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </FormField>
        <Button type="submit" :disabled="pending">{{ t('auth.invitation.submit') }}</Button>
      </form>
    </template>
    <template v-else-if="invitation">
      <p class="text-destructive" data-testid="invitation-unusable">
        {{
          invitation.status === 'expired'
            ? t('auth.invitation.expired')
            : t('auth.invitation.invalid')
        }}
      </p>
      <Button as-child variant="outline"
        ><RouterLink to="/login">{{ t('auth.login.submit') }}</RouterLink></Button
      >
    </template>
  </AuthCard>
</template>
