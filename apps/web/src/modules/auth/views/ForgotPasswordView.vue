<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import AuthCard from '../components/AuthCard.vue'

const session = useSessionStore()
const email = ref('')
const sent = ref(false)

const { run, pending, error, fieldErrors } = useSubmit(async () => {
  await session.requestPasswordReset(email.value)
  sent.value = true
})
</script>

<template>
  <AuthCard :title="t('auth.forgot.title')" :description="t('auth.forgot.description')">
    <p v-if="sent" data-testid="reset-sent">
      {{ t('auth.forgot.sent', { email }) }}
    </p>
    <form v-else class="flex flex-col gap-4" @submit.prevent="run()">
      <ErrorAlert :error="error" />
      <FormField v-slot="{ id }" :label="t('auth.email')" name="email" :errors="fieldErrors">
        <Input :id="id" v-model="email" type="email" autocomplete="email" required />
      </FormField>
      <Button type="submit" :disabled="pending">{{ t('auth.forgot.submit') }}</Button>
    </form>
    <template #footer
      ><RouterLink to="/login" class="underline">{{ t('auth.backToSignIn') }}</RouterLink></template
    >
  </AuthCard>
</template>
