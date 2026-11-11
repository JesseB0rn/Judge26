<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import AuthCard from '../components/AuthCard.vue'

const session = useSessionStore()
const route = useRoute()
const token = typeof route.query.token === 'string' ? route.query.token : ''
const password = ref('')
const done = ref(false)

const { run, pending, error, fieldErrors } = useSubmit(async () => {
  await session.confirmPasswordReset(token, password.value)
  done.value = true
})
</script>

<template>
  <AuthCard :title="t('auth.reset.title')">
    <template v-if="done">
      <p data-testid="reset-done">{{ t('auth.reset.done') }}</p>
      <Button as-child
        ><RouterLink to="/login">{{ t('auth.login.submit') }}</RouterLink></Button
      >
    </template>
    <p v-else-if="!token" class="text-destructive">{{ t('auth.reset.invalidLink') }}</p>
    <form v-else class="flex flex-col gap-4" @submit.prevent="run()">
      <ErrorAlert :error="error" />
      <FormField
        v-slot="{ id }"
        :label="t('auth.reset.newPassword')"
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
      <Button type="submit" :disabled="pending">{{ t('auth.reset.submit') }}</Button>
    </form>
  </AuthCard>
</template>
