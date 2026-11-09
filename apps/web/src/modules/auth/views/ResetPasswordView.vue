<script setup lang="ts">
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
  <AuthCard title="Choose a new password">
    <template v-if="done">
      <p data-testid="reset-done">Your password has been changed.</p>
      <Button as-child><RouterLink to="/login">Sign in</RouterLink></Button>
    </template>
    <p v-else-if="!token" class="text-destructive">This reset link is invalid.</p>
    <form v-else class="flex flex-col gap-4" @submit.prevent="run()">
      <ErrorAlert :error="error" />
      <FormField
        v-slot="{ id }"
        label="New password"
        name="password"
        :errors="fieldErrors"
        description="At least 8 characters."
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
      <Button type="submit" :disabled="pending">Change password</Button>
    </form>
  </AuthCard>
</template>
