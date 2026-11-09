<script setup lang="ts">
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
  <AuthCard title="Reset password" description="We will email you a link to choose a new password.">
    <p v-if="sent" data-testid="reset-sent">
      If an account exists for {{ email }}, a reset link is on its way.
    </p>
    <form v-else class="flex flex-col gap-4" @submit.prevent="run()">
      <ErrorAlert :error="error" />
      <FormField v-slot="{ id }" label="Email" name="email" :errors="fieldErrors">
        <Input :id="id" v-model="email" type="email" autocomplete="email" required />
      </FormField>
      <Button type="submit" :disabled="pending">Send reset link</Button>
    </form>
    <template #footer
      ><RouterLink to="/login" class="underline">Back to sign in</RouterLink></template
    >
  </AuthCard>
</template>
