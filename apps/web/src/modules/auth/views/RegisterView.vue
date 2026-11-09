<script setup lang="ts">
import { reactive } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldGroup } from '@/components/ui/field'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import AuthCard from '../components/AuthCard.vue'

const session = useSessionStore()
const router = useRouter()
const form = reactive({ name: '', email: '', password: '' })

const { run, pending, error, fieldErrors } = useSubmit(async () => {
  await session.register(form)
  await router.replace({ name: 'verify-email' })
})
</script>

<template>
  <AuthCard title="Create an account" description="Coaches register teams with their account.">
    <form class="flex flex-col gap-4" @submit.prevent="run()">
      <ErrorAlert :error="error" />
      <FieldGroup>
        <FormField v-slot="{ id }" label="Full name" name="name" :errors="fieldErrors">
          <Input :id="id" v-model="form.name" autocomplete="name" required />
        </FormField>
        <FormField v-slot="{ id }" label="Email" name="email" :errors="fieldErrors">
          <Input :id="id" v-model="form.email" type="email" autocomplete="email" required />
        </FormField>
        <FormField
          v-slot="{ id }"
          label="Password"
          name="password"
          :errors="fieldErrors"
          description="At least 8 characters."
        >
          <Input
            :id="id"
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </FormField>
      </FieldGroup>
      <Button type="submit" :disabled="pending">Create account</Button>
    </form>
    <template #footer>
      Already registered? <RouterLink to="/login" class="underline">Sign in</RouterLink>
    </template>
  </AuthCard>
</template>
